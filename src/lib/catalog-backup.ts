/**
 * Backup del catálogo SpecParts: snapshot diario del JSON crudo + un
 * Excel human-readable. Propósito:
 *
 *   1. Backup histórico — si el proveedor se cae, cambia condiciones o
 *      cierra, tenemos la data. El JSON preserva fidelidad 100%
 *      (attributes, vehicles con años, pictures con URLs).
 *   2. Exportación para la cliente — el Excel se puede abrir con
 *      Excel/Sheets para auditorías, listas, o para pasárselo a terceros
 *      (distribuidores, contadores).
 *   3. Fallback de runtime — si `listCatalog()` falla en producción,
 *      servimos el último snapshot exitoso desde Blob (ver
 *      `listCatalogWithFallback` en `src/lib/api/specparts.ts`).
 *
 * Storage:
 *   - Archivos: Vercel Blob público, paths
 *     `catalog-backup/griffo-catalog-YYYY-MM-DD.{json,xlsx}`
 *   - Metadata: Redis key `catalog-backup:snapshots` = array JSON
 *     ordenado descendente por fecha. Máximo 30 entradas (retención
 *     ~1 mes).
 *
 * Flujos que disparan una regeneración:
 *   - Manual: botón "Regenerar" en /admin/catalogo-backup.
 *   - Automático: cron diario a las 4am UTC (`/api/cron/catalog-backup`,
 *     schedule en `vercel.json`).
 *
 * Idempotencia: si hoy ya hay un snapshot, se sobreescribe. La entrada
 * en el array se actualiza en lugar de agregarse.
 *
 * Nota: este módulo es server-only de hecho (depende de @vercel/blob y
 * exceljs, que no corren en browser). Antes tenía `import "server-only"`
 * explícito, pero Turbopack seguía el dynamic import desde specparts.ts
 * aunque el bundler de cliente no lo iba a cargar en runtime, y tiraba
 * error al compilar. Lo removimos — si algún día alguien lo importa de
 * un client component, va a romper igual por las deps nativas.
 */

import { del, put } from "@vercel/blob";
import ExcelJS from "exceljs";

import flotaData from "@/data/flota-circulante.json";
import { listCatalog } from "@/lib/api/specparts";
import { getDisplayApplication } from "@/lib/catalog/display";
import { getAttrValues } from "@/lib/catalog/utils";
import { getRedis } from "@/lib/kv";
import type { CatalogProduct, SpecPartsVehicle } from "@/types/specparts";

/** Lookup flota circulante.
 *  Clave: "MARCA||MODELO PRINCIPAL||GAMA||VERSIÓN||AÑO DESDE||AÑO HASTA" (uppercase).
 *  Fuente: GRIFFOFORMATO_PROMOTIVE — actualizar src/data/flota-circulante.json. */
const FLOTA: Record<string, number> = flotaData as Record<string, number>;

function getFlota(v: SpecPartsVehicle): number | "" {
  const key = [
    v.brand, v.master_model, v.model, v.version,
    v.sold_from_year, v.sold_until_year,
  ].map((s) => String(s ?? "").trim().toUpperCase()).join("||");
  const val = FLOTA[key];
  return typeof val === "number" ? val : "";
}

const META_KEY = "catalog-backup:snapshots";
const MAX_SNAPSHOTS = 30;

export type CatalogSnapshot = {
  /** YYYY-MM-DD, clave primaria. */
  date: string;
  /** ISO date-time de la generación exacta. */
  generatedAt: string;
  jsonUrl: string;
  jsonBytes: number;
  xlsxUrl: string;
  xlsxBytes: number;
  productCount: number;
};

export async function readSnapshots(): Promise<CatalogSnapshot[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const raw = await redis.get<CatalogSnapshot[] | string>(META_KEY);
    if (!raw) return [];
    const arr = typeof raw === "string" ? (JSON.parse(raw) as CatalogSnapshot[]) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeSnapshots(list: CatalogSnapshot[]): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis no configurado");
  await redis.set(META_KEY, JSON.stringify(list));
}

export async function readLatestSnapshot(): Promise<CatalogSnapshot | null> {
  const list = await readSnapshots();
  return list[0] ?? null;
}

/**
 * Genera un snapshot nuevo del catálogo. Lee SpecParts, sube JSON +
 * Excel a Blob, y actualiza la metadata en Redis. Si hoy ya hay snapshot,
 * lo sobreescribe (tanto los Blobs como la entrada del array).
 *
 * Devuelve el snapshot recién creado.
 */
export async function regenerateCatalogSnapshot(): Promise<CatalogSnapshot> {
  const products = await listCatalog({ skipFallback: true });
  if (!products.length) {
    throw new Error("SpecParts devolvió 0 productos — no se genera snapshot vacío");
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const generatedAt = now.toISOString();
  // Sufijo de timestamp para garantizar URL única — evita que el CDN de
  // Vercel sirva una versión cacheada de un archivo con el mismo nombre.
  const ts = now.toISOString().slice(11, 19).replace(/:/g, ""); // ej. "143022"
  const fileBase = `catalog-backup/griffo-catalog-${today}-${ts}`;

  const jsonBlob = JSON.stringify(products);
  const xlsxBuffer = await buildXlsx(products);

  // Borrar los blobs del día anterior (si existen) antes de subir los nuevos.
  const existingBeforeUpload = await readSnapshots();
  const todayExisting = existingBeforeUpload.find((s) => s.date === today);
  if (todayExisting) {
    await Promise.all([
      del(todayExisting.jsonUrl).catch(() => undefined),
      del(todayExisting.xlsxUrl).catch(() => undefined),
    ]);
  }

  const [jsonUpload, xlsxUpload] = await Promise.all([
    put(`${fileBase}.json`, jsonBlob, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
    }),
    put(`${fileBase}.xlsx`, xlsxBuffer, {
      access: "public",
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      addRandomSuffix: false,
    }),
  ]);

  const snapshot: CatalogSnapshot = {
    date: today,
    generatedAt,
    jsonUrl: jsonUpload.url,
    jsonBytes: Buffer.byteLength(jsonBlob, "utf8"),
    xlsxUrl: xlsxUpload.url,
    xlsxBytes: xlsxBuffer.byteLength,
    productCount: products.length,
  };

  const existing = existingBeforeUpload;
  const merged = [
    snapshot,
    ...existing.filter((s) => s.date !== today),
  ].slice(0, MAX_SNAPSHOTS);

  // Antes de persistir, borramos del Blob los snapshots que quedaron
  // fuera de la ventana — evita acumular MB indefinidamente. Fallos
  // silenciosos (si un Blob ya no existe, no es grave).
  const dropped = existing.filter(
    (s) => !merged.some((m) => m.date === s.date),
  );
  await Promise.all(
    dropped.flatMap((s) => [
      del(s.jsonUrl).catch(() => undefined),
      del(s.xlsxUrl).catch(() => undefined),
    ]),
  );

  await writeSnapshots(merged);
  return snapshot;
}

/* -------------------------------------------------------------------------- */
/*  Excel builder                                                              */
/* -------------------------------------------------------------------------- */

/**
 * 4 hojas denormalizadas para que el Excel sea útil:
 *   - Productos: 1 fila por producto (core fields + conteos).
 *   - Vehículos: 1 fila por par producto×vehículo compatible.
 *   - Atributos: 1 fila por par producto×atributo.
 *   - Base: vehículo × tipo de producto (matriz de cobertura).
 *
 * Cualquiera de las tres basta para re-importar el catálogo en otro
 * sistema si el proveedor original deja de funcionar.
 */
async function buildXlsx(products: CatalogProduct[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Griffo web";
  wb.created = new Date();

  /* --- Sheet 1: Productos --- */
  const productSheet = wb.addWorksheet("Productos");
  productSheet.columns = [
    { header: "Código", key: "code", width: 14 },
    { header: "Código seguro", key: "safeCode", width: 16 },
    { header: "Línea", key: "category", width: 14 },
    { header: "Producto", key: "product", width: 28 },
    { header: "Kit", key: "isKit", width: 6 },
    { header: "Descripción", key: "description", width: 40 },
    { header: "Observaciones", key: "observation", width: 40 },
    { header: "Ubicación", key: "ubicacion", width: 22 },
    { header: "Lado", key: "lado", width: 22 },
    { header: "Vehículos", key: "vehicleCount", width: 12 },
    { header: "Fotos", key: "pictureCount", width: 8 },
    { header: "Discontinuado", key: "discontinued", width: 14 },
    { header: "Habilitado", key: "enabled", width: 12 },
    { header: "Slug", key: "slug", width: 40 },
    { header: "Actualizado", key: "updatedAt", width: 22 },
  ];
  for (const p of products) {
    const { ubicaciones, lados } = getDisplayApplication(p);
    productSheet.addRow({
      code: p.code,
      safeCode: p.safe_code,
      category: p.category,
      product: p.product,
      isKit: p.is_kit ? "Sí" : "No",
      description: p.description,
      observation: p.observation ?? "",
      ubicacion: ubicaciones.join(", "),
      lado: lados.join(", "),
      vehicleCount: p.vehicles?.length ?? 0,
      pictureCount: p.pictures?.length ?? 0,
      discontinued: p.discontinued ? "Sí" : "No",
      enabled: p.enabled ? "Sí" : "No",
      slug: p.slug,
      updatedAt: p.updated_at,
    });
  }
  styleHeader(productSheet);
  productSheet.views = [{ state: "frozen", ySplit: 1 }];
  productSheet.autoFilter = { from: "A1", to: "O1" };

  /* --- Sheet 2: Vehículos --- */
  const vehicleSheet = wb.addWorksheet("Vehículos");
  vehicleSheet.columns = [
    { header: "Código producto", key: "code", width: 14 },
    { header: "Marca", key: "brand", width: 16 },
    { header: "Modelo base", key: "masterModel", width: 20 },
    { header: "Modelo", key: "model", width: 24 },
    { header: "Versión", key: "version", width: 18 },
    { header: "Año desde", key: "from", width: 12 },
    { header: "Año hasta", key: "until", width: 12 },
    { header: "Nombre comercial", key: "marketName", width: 24 },
    { header: "Cód. Promotive", key: "promoCode", width: 16 },
  ];
  for (const p of products) {
    for (const v of p.vehicles ?? []) {
      vehicleSheet.addRow({
        code: p.code,
        brand: v.brand,
        masterModel: v.master_model,
        model: v.model,
        version: v.version,
        from: v.sold_from_year,
        until: v.sold_until_year,
        marketName: v.market_name ?? "",
        promoCode: v.code ?? "",
      });
    }
  }
  styleHeader(vehicleSheet);
  vehicleSheet.views = [{ state: "frozen", ySplit: 1 }];
  vehicleSheet.autoFilter = { from: "A1", to: "I1" };

  /* --- Sheet 3: Atributos --- */
  const attrSheet = wb.addWorksheet("Atributos");
  attrSheet.columns = [
    { header: "Código producto", key: "code", width: 14 },
    { header: "Atributo", key: "name", width: 28 },
    { header: "Valor", key: "value", width: 20 },
    { header: "Unidad", key: "unit", width: 10 },
  ];
  for (const p of products) {
    for (const a of p.attributes ?? []) {
      attrSheet.addRow({
        code: p.code,
        name: a.name,
        value: a.value,
        unit: a.unit,
      });
    }
  }
  styleHeader(attrSheet);
  attrSheet.views = [{ state: "frozen", ySplit: 1 }];
  attrSheet.autoFilter = { from: "A1", to: "D1" };

  /* --- Sheet 4: Base --- */
  addBaseSheet(wb, products);

  /* --- Sheet 5: Cobertura --- */
  addCoberturaSheet(wb, products);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function styleHeader(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF00549F" },
  };
  header.alignment = { vertical: "middle" };
  header.height = 20;
}

/* -------------------------------------------------------------------------- */
/*  Sheet 4: Base — vehículo × tipo de producto                               */
/* -------------------------------------------------------------------------- */

/**
 * Devuelve TODOS los índices de columna de la hoja "Base" donde aplica un
 * producto. Un producto puede caer en más de una columna (ej. un fuelle de
 * dirección que aplica a IZQ y DER a la vez).
 *
 *  1  Fuelle cremallera    Dirección  DER
 *  2  Fuelle cremallera    Dirección  IZQ
 *  3  Kit fuelle+tope      Suspensión DEL
 *  4  Kit fuelle+tope      Suspensión TRA
 *  5  Tope amortiguador    Suspensión DEL
 *  6  Tope amortiguador    Suspensión TRA
 *  7  Fuelle semieje       Transm.    DER / CAJA
 *  8  Fuelle semieje       Transm.    DER / RUEDA
 *  9  Fuelle semieje       Transm.    IZQ / CAJA
 * 10  Fuelle semieje       Transm.    IZQ / RUEDA
 * 11  Kit fuelle semieje   Transm.    DER / CAJA
 * 12  Kit fuelle semieje   Transm.    DER / RUEDA
 * 13  Kit fuelle semieje   Transm.    IZQ / CAJA
 * 14  Kit fuelle semieje   Transm.    IZQ / RUEDA
 *
 * Usa `includes` en lugar de `startsWith` para capturar valores compuestos
 * como "Izquierdo y/o Derecho (según vehículo)" que deben ir a ambas columnas.
 */
function getProductBaseColIndices(p: CatalogProduct): number[] {
  const cat = (p.category || "").toLowerCase();
  const name = p.product.toUpperCase();
  const isKit = p.is_kit === 1 || name.includes("KIT");

  // getDisplayApplication normaliza las ubicaciones/lados por línea:
  //   Dirección:  ubicaciones incluye DERECHO/IZQUIERDO (promovidos desde lado)
  //   Suspensión: ubicaciones incluye DELANTERO/TRASERO
  //   Transmisión: ubicaciones incluye LADO CAJA/LADO RUEDA; lados incluye DER/IZQ
  const { ubicaciones, lados } = getDisplayApplication(p);
  const ubs = ubicaciones.map((s) => s.toUpperCase());
  const lds = lados.map((s) => s.toUpperCase());

  const cols: number[] = [];

  if (cat.includes("direc")) {
    // includes() en lugar de startsWith() para capturar "IZQUIERDO Y/O DERECHO"
    if (ubs.some((s) => s.includes("DERECH"))) cols.push(1);
    if (ubs.some((s) => s.includes("IZQUIER"))) cols.push(2);
    return cols;
  }

  if (cat.includes("susp")) {
    const isTope = name.includes("TOPE") && !name.includes("FUELLE");
    if (isKit) {
      if (ubs.some((s) => s.startsWith("DELANT"))) cols.push(3);
      if (ubs.some((s) => s.startsWith("TRASER"))) cols.push(4);
    } else if (isTope) {
      if (ubs.some((s) => s.startsWith("DELANT"))) cols.push(5);
      if (ubs.some((s) => s.startsWith("TRASER"))) cols.push(6);
    }
    return cols;
  }

  if (cat.includes("trans")) {
    const isCaja  = ubs.some((s) => s.includes("CAJA"));
    const isRueda = ubs.some((s) => s.includes("RUEDA"));
    const isDer   = lds.some((s) => s.includes("DERECH"));
    const isIzq   = lds.some((s) => s.includes("IZQUIER"));
    if (!isKit) {
      if (isDer && isCaja)  cols.push(7);
      if (isDer && isRueda) cols.push(8);
      if (isIzq && isCaja)  cols.push(9);
      if (isIzq && isRueda) cols.push(10);
    } else {
      if (isDer && isCaja)  cols.push(11);
      if (isDer && isRueda) cols.push(12);
      if (isIzq && isCaja)  cols.push(13);
      if (isIzq && isRueda) cols.push(14);
    }
    return cols;
  }

  return cols;
}

function addBaseSheet(wb: ExcelJS.Workbook, products: CatalogProduct[]): void {
  const ws = wb.addWorksheet("Base");

  const PROD_START = 13; // Column M (1-based) — I es Flota Circulante, J-L separadores
  const N_PROD = 14;
  const N_HEADER = 6;

  const C_DIR = "FF00B050"; // green  — Dirección
  const C_SUS = "FF4472C4"; // blue   — Suspensión
  const C_TRA = "FFC65911"; // brown  — Transmisión
  const C_VEH = "FF00549F"; // Griffo blue — vehicle column labels
  const C_CODE = "FFE2EFDA"; // light green — cells with a product code

  type ColSpec = {
    sistema: string;
    pieza: string;
    posicion: string;
    lado: string;
    color: string;
  };
  const COLS: ColSpec[] = [
    { sistema: "Dirección",   pieza: "Fuelle cremallera",  posicion: "",      lado: "DER", color: C_DIR },
    { sistema: "Dirección",   pieza: "Fuelle cremallera",  posicion: "",      lado: "IZQ", color: C_DIR },
    { sistema: "Suspensión",  pieza: "Kit fuelle+tope",    posicion: "DEL",   lado: "",    color: C_SUS },
    { sistema: "Suspensión",  pieza: "Kit fuelle+tope",    posicion: "TRA",   lado: "",    color: C_SUS },
    { sistema: "Suspensión",  pieza: "Tope amortiguador",  posicion: "DEL",   lado: "",    color: C_SUS },
    { sistema: "Suspensión",  pieza: "Tope amortiguador",  posicion: "TRA",   lado: "",    color: C_SUS },
    { sistema: "Transmisión", pieza: "Fuelle semieje",     posicion: "CAJA",  lado: "DER", color: C_TRA },
    { sistema: "Transmisión", pieza: "Fuelle semieje",     posicion: "RUEDA", lado: "DER", color: C_TRA },
    { sistema: "Transmisión", pieza: "Fuelle semieje",     posicion: "CAJA",  lado: "IZQ", color: C_TRA },
    { sistema: "Transmisión", pieza: "Fuelle semieje",     posicion: "RUEDA", lado: "IZQ", color: C_TRA },
    { sistema: "Transmisión", pieza: "Kit fuelle semieje", posicion: "CAJA",  lado: "DER", color: C_TRA },
    { sistema: "Transmisión", pieza: "Kit fuelle semieje", posicion: "RUEDA", lado: "DER", color: C_TRA },
    { sistema: "Transmisión", pieza: "Kit fuelle semieje", posicion: "CAJA",  lado: "IZQ", color: C_TRA },
    { sistema: "Transmisión", pieza: "Kit fuelle semieje", posicion: "RUEDA", lado: "IZQ", color: C_TRA },
  ];

  // A-F: vehicle data, G: Cód. Promotive, H: Market Name, I: Flota Circ., J-L: sep, M+: productos
  [16, 20, 24, 18, 10, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getColumn(7).width = 16;  // G: Cód. Promotive
  ws.getColumn(8).width = 22;  // H: Nombre comercial
  ws.getColumn(9).width = 16;  // I: Flota circulante
  for (let i = 10; i <= 12; i++) ws.getColumn(i).width = 2;
  for (let i = 0; i < N_PROD; i++) ws.getColumn(PROD_START + i).width = 13;

  function hdrCell(cell: ExcelJS.Cell, color: string, value: string | number): void {
    cell.value = value;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }

  // Row 1 — Column numbers 1–14
  {
    const row = ws.getRow(1);
    row.height = 18;
    for (let i = 0; i < N_PROD; i++) hdrCell(row.getCell(PROD_START + i), COLS[i].color, i + 1);
    row.commit();
  }

  // Row 2 — Sistema (merged per system)
  {
    const row = ws.getRow(2);
    row.height = 28;
    for (const g of [
      { label: "Dirección",   s: 0,  e: 1,  c: C_DIR },
      { label: "Suspensión",  s: 2,  e: 5,  c: C_SUS },
      { label: "Transmisión", s: 6,  e: 13, c: C_TRA },
    ]) {
      const sc = PROD_START + g.s, ec = PROD_START + g.e;
      ws.mergeCells(2, sc, 2, ec);
      hdrCell(row.getCell(sc), g.c, g.label);
    }
    row.commit();
  }

  // Row 3 — Pieza (merged per piece group)
  {
    const row = ws.getRow(3);
    row.height = 28;
    for (const g of [
      { label: "Fuelle cremallera",  s: 0,  e: 1,  c: C_DIR },
      { label: "Kit fuelle+tope",    s: 2,  e: 3,  c: C_SUS },
      { label: "Tope amortiguador",  s: 4,  e: 5,  c: C_SUS },
      { label: "Fuelle semieje",     s: 6,  e: 9,  c: C_TRA },
      { label: "Kit fuelle semieje", s: 10, e: 13, c: C_TRA },
    ]) {
      const sc = PROD_START + g.s, ec = PROD_START + g.e;
      ws.mergeCells(3, sc, 3, ec);
      hdrCell(row.getCell(sc), g.c, g.label);
    }
    row.commit();
  }

  // Row 4 — Marca (merged per system, all GRIFFO)
  {
    const row = ws.getRow(4);
    row.height = 22;
    for (const g of [
      { s: 0,  e: 1,  c: C_DIR },
      { s: 2,  e: 5,  c: C_SUS },
      { s: 6,  e: 13, c: C_TRA },
    ]) {
      const sc = PROD_START + g.s, ec = PROD_START + g.e;
      ws.mergeCells(4, sc, 4, ec);
      hdrCell(row.getCell(sc), g.c, "GRIFFO");
    }
    row.commit();
  }

  // Row 5 — Posición
  {
    const row = ws.getRow(5);
    row.height = 22;
    for (let i = 0; i < N_PROD; i++) {
      hdrCell(row.getCell(PROD_START + i), COLS[i].color, COLS[i].posicion);
    }
    row.commit();
  }

  // Row 6 — Vehicle column labels (A-F) + Lado (J-W)
  {
    const row = ws.getRow(6);
    row.height = 24;
    const vehLabels = ["Marca", "Modelo base", "Modelo", "Versión", "Año desde", "Año hasta", "Cód. Promotive", "Nombre comercial", "Flota circulante"];
    for (let i = 0; i < vehLabels.length; i++) {
      const cell = row.getCell(i + 1);
      cell.value = vehLabels[i];
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_VEH } };
      cell.alignment = { vertical: "middle" };
    }
    for (let i = 0; i < N_PROD; i++) {
      hdrCell(row.getCell(PROD_START + i), COLS[i].color, COLS[i].lado);
    }
    row.commit();
  }

  // Build vehicle → product-code map (acumula todos los códigos por columna,
  // separados por espacio — no first-wins para que un vehículo con múltiples
  // productos en la misma celda los muestre todos).
  type VehicleEntry = { v: SpecPartsVehicle; codes: Map<number, string> };
  const vehicleMap = new Map<string, VehicleEntry>();

  for (const p of products) {
    const colIndices = getProductBaseColIndices(p);
    if (colIndices.length === 0) continue;
    for (const v of p.vehicles ?? []) {
      const key = [
        v.brand, v.master_model, v.model, v.version,
        v.sold_from_year, v.sold_until_year, v.code ?? "",
      ].join("||");
      if (!vehicleMap.has(key)) vehicleMap.set(key, { v, codes: new Map() });
      const entry = vehicleMap.get(key)!;
      for (const colIdx of colIndices) {
        const prev = entry.codes.get(colIdx);
        entry.codes.set(colIdx, prev ? `${prev}; ${p.code}` : p.code);
      }
    }
  }

  // Sort: brand → master_model → model → version → year_from
  const sorted = Array.from(vehicleMap.values()).sort((a, b) => {
    const x = a.v, y = b.v;
    return (
      (x.brand || "").localeCompare(y.brand || "") ||
      (x.master_model || "").localeCompare(y.master_model || "") ||
      (x.model || "").localeCompare(y.model || "") ||
      (x.version || "").localeCompare(y.version || "") ||
      (x.sold_from_year || 0) - (y.sold_from_year || 0)
    );
  });

  // Data rows starting at row 7
  for (let i = 0; i < sorted.length; i++) {
    const { v, codes } = sorted[i];
    const row = ws.getRow(N_HEADER + 1 + i);
    row.getCell(1).value = v.brand;
    row.getCell(2).value = v.master_model;
    row.getCell(3).value = v.model;
    row.getCell(4).value = v.version;
    row.getCell(5).value = v.sold_from_year;
    row.getCell(6).value = v.sold_until_year;
    row.getCell(7).value = v.code ?? "";
    row.getCell(8).value = v.market_name ?? "";
    row.getCell(9).value = getFlota(v);
    for (let c = 1; c <= N_PROD; c++) {
      const code = codes.get(c);
      if (code) {
        const cell = row.getCell(PROD_START + c - 1);
        cell.value = code;
        cell.font = { bold: true, size: 9 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_CODE } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
    }
    row.commit();
  }

  // Freeze: columns A-I (9 cols) and rows 1-6 (6 header rows)
  ws.views = [{ state: "frozen", xSplit: 12, ySplit: 6, topLeftCell: "M7", activeCell: "M7" }];
}

/* -------------------------------------------------------------------------- */
/*  Sheet 5: Cobertura — vehículo × tipo de producto (18 columnas)            */
/* -------------------------------------------------------------------------- */

/**
 * Variante de 18 columnas que separa IZQ/DER también en Suspensión
 * (a diferencia de Base que las agrupa). Equivale al panel web /admin/cobertura
 * pero con detalle completo de vehículo (año, versión, modelo, etc.).
 *
 * Columnas de producto (1-18):
 *  1-2   Dirección   Fuelle cremallera         DER / IZQ
 *  3-6   Suspensión  Kit fuelle+tope            DEL·DER / DEL·IZQ / TRA·DER / TRA·IZQ
 *  7-10  Suspensión  Tope amortiguador          DEL·DER / DEL·IZQ / TRA·DER / TRA·IZQ
 * 11-14  Transmisión Fuelle semieje             DER·CAJA / DER·RUEDA / IZQ·CAJA / IZQ·RUEDA
 * 15-18  Transmisión Kit fuelle semieje         DER·CAJA / DER·RUEDA / IZQ·CAJA / IZQ·RUEDA
 */
function getCoberturaColIndices(p: CatalogProduct): number[] {
  const cat = (p.category || "").toLowerCase();
  const name = p.product.toUpperCase();
  const isKit = p.is_kit === 1 || name.includes("KIT");
  const { ubicaciones, lados } = getDisplayApplication(p);
  const ubs = ubicaciones.map((s) => s.toUpperCase());
  const lds = lados.map((s) => s.toUpperCase());
  // En Suspensión, getDisplayApplication elimina IZQ/DER de lados — leer
  // los atributos crudos para recuperar esa info.
  const rawSides = getAttrValues(p, "lado").map((s) => s.toUpperCase());
  const cols: number[] = [];

  if (cat.includes("direc")) {
    // Dirección promueve IZQ/DER a ubicaciones — usar ubs.
    if (ubs.some((s) => s.includes("DERECH"))) cols.push(1);
    if (ubs.some((s) => s.includes("IZQUIER"))) cols.push(2);
    return cols;
  }

  if (cat.includes("susp")) {
    const isTope = name.includes("TOPE") && !name.includes("FUELLE");
    // "Izquierdo y/o Derecho" → ambas columnas.
    const hasDer = rawSides.some((s) => s.includes("DERECH"));
    const hasIzq = rawSides.some((s) => s.includes("IZQUIER"));
    if (isKit) {
      if (ubs.some((s) => s.includes("DELANT"))) {
        if (hasDer) cols.push(3);
        if (hasIzq) cols.push(4);
      }
      if (ubs.some((s) => s.includes("TRASER"))) {
        if (hasDer) cols.push(5);
        if (hasIzq) cols.push(6);
      }
    } else if (isTope) {
      if (ubs.some((s) => s.includes("DELANT"))) {
        if (hasDer) cols.push(7);
        if (hasIzq) cols.push(8);
      }
      if (ubs.some((s) => s.includes("TRASER"))) {
        if (hasDer) cols.push(9);
        if (hasIzq) cols.push(10);
      }
    }
    return cols;
  }

  if (cat.includes("trans")) {
    const isCaja  = ubs.some((s) => s.includes("CAJA"));
    const isRueda = ubs.some((s) => s.includes("RUEDA"));
    const isDer   = lds.some((s) => s.includes("DERECH"));
    const isIzq   = lds.some((s) => s.includes("IZQUIER"));
    if (!isKit) {
      if (isDer && isCaja)  cols.push(11);
      if (isDer && isRueda) cols.push(12);
      if (isIzq && isCaja)  cols.push(13);
      if (isIzq && isRueda) cols.push(14);
    } else {
      if (isDer && isCaja)  cols.push(15);
      if (isDer && isRueda) cols.push(16);
      if (isIzq && isCaja)  cols.push(17);
      if (isIzq && isRueda) cols.push(18);
    }
    return cols;
  }

  return cols;
}

function addCoberturaSheet(wb: ExcelJS.Workbook, products: CatalogProduct[]): void {
  const ws = wb.addWorksheet("Cobertura");

  const N_VEH = 8;    // A-H: vehicle cols
  const N_SEP = 2;    // I-J: separators
  const PROD_START = N_VEH + N_SEP + 1; // = 11 (column K, 1-based)
  const N_PROD = 18;
  const N_HEADER = 6;

  const C_DIR = "FF00B050";
  const C_SUS = "FF4472C4";
  const C_TRA = "FFC65911";
  const C_VEH = "FF00549F";
  const C_CODE = "FFE2EFDA";

  type CobCol = { sistema: string; pieza: string; pos: string; lado: string; color: string };
  const COLS: CobCol[] = [
    // Dirección
    { sistema: "Dirección",   pieza: "Fuelle cremallera",  pos: "",      lado: "DER", color: C_DIR },
    { sistema: "Dirección",   pieza: "Fuelle cremallera",  pos: "",      lado: "IZQ", color: C_DIR },
    // Suspensión — Kit fuelle+tope
    { sistema: "Suspensión",  pieza: "Kit fuelle+tope",    pos: "DEL",   lado: "DER", color: C_SUS },
    { sistema: "Suspensión",  pieza: "Kit fuelle+tope",    pos: "DEL",   lado: "IZQ", color: C_SUS },
    { sistema: "Suspensión",  pieza: "Kit fuelle+tope",    pos: "TRA",   lado: "DER", color: C_SUS },
    { sistema: "Suspensión",  pieza: "Kit fuelle+tope",    pos: "TRA",   lado: "IZQ", color: C_SUS },
    // Suspensión — Tope amortiguador
    { sistema: "Suspensión",  pieza: "Tope amortiguador",  pos: "DEL",   lado: "DER", color: C_SUS },
    { sistema: "Suspensión",  pieza: "Tope amortiguador",  pos: "DEL",   lado: "IZQ", color: C_SUS },
    { sistema: "Suspensión",  pieza: "Tope amortiguador",  pos: "TRA",   lado: "DER", color: C_SUS },
    { sistema: "Suspensión",  pieza: "Tope amortiguador",  pos: "TRA",   lado: "IZQ", color: C_SUS },
    // Transmisión — Fuelle semieje
    { sistema: "Transmisión", pieza: "Fuelle semieje",     pos: "CAJA",  lado: "DER", color: C_TRA },
    { sistema: "Transmisión", pieza: "Fuelle semieje",     pos: "RUEDA", lado: "DER", color: C_TRA },
    { sistema: "Transmisión", pieza: "Fuelle semieje",     pos: "CAJA",  lado: "IZQ", color: C_TRA },
    { sistema: "Transmisión", pieza: "Fuelle semieje",     pos: "RUEDA", lado: "IZQ", color: C_TRA },
    // Transmisión — Kit fuelle semieje
    { sistema: "Transmisión", pieza: "Kit fuelle semieje", pos: "CAJA",  lado: "DER", color: C_TRA },
    { sistema: "Transmisión", pieza: "Kit fuelle semieje", pos: "RUEDA", lado: "DER", color: C_TRA },
    { sistema: "Transmisión", pieza: "Kit fuelle semieje", pos: "CAJA",  lado: "IZQ", color: C_TRA },
    { sistema: "Transmisión", pieza: "Kit fuelle semieje", pos: "RUEDA", lado: "IZQ", color: C_TRA },
  ];

  // Column widths
  [16, 20, 24, 18, 10, 10, 22, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (let i = N_VEH + 1; i <= N_VEH + N_SEP; i++) ws.getColumn(i).width = 2;
  for (let i = 0; i < N_PROD; i++) ws.getColumn(PROD_START + i).width = 13;

  function hdrCell(cell: ExcelJS.Cell, color: string, value: string | number): void {
    cell.value = value;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }

  // Row 1 — Column numbers 1-18
  {
    const row = ws.getRow(1);
    row.height = 18;
    for (let i = 0; i < N_PROD; i++) hdrCell(row.getCell(PROD_START + i), COLS[i].color, i + 1);
    row.commit();
  }

  // Row 2 — Sistema (merged)
  {
    const row = ws.getRow(2);
    row.height = 28;
    for (const g of [
      { label: "Dirección",   s: 0,  e: 1,  c: C_DIR },
      { label: "Suspensión",  s: 2,  e: 9,  c: C_SUS },
      { label: "Transmisión", s: 10, e: 17, c: C_TRA },
    ]) {
      const sc = PROD_START + g.s, ec = PROD_START + g.e;
      ws.mergeCells(2, sc, 2, ec);
      hdrCell(row.getCell(sc), g.c, g.label);
    }
    row.commit();
  }

  // Row 3 — Pieza (merged)
  {
    const row = ws.getRow(3);
    row.height = 28;
    for (const g of [
      { label: "Fuelle cremallera",  s: 0,  e: 1,  c: C_DIR },
      { label: "Kit fuelle+tope",    s: 2,  e: 5,  c: C_SUS },
      { label: "Tope amortiguador",  s: 6,  e: 9,  c: C_SUS },
      { label: "Fuelle semieje",     s: 10, e: 13, c: C_TRA },
      { label: "Kit fuelle semieje", s: 14, e: 17, c: C_TRA },
    ]) {
      const sc = PROD_START + g.s, ec = PROD_START + g.e;
      ws.mergeCells(3, sc, 3, ec);
      hdrCell(row.getCell(sc), g.c, g.label);
    }
    row.commit();
  }

  // Row 4 — GRIFFO (merged per system)
  {
    const row = ws.getRow(4);
    row.height = 22;
    for (const g of [
      { s: 0,  e: 1,  c: C_DIR },
      { s: 2,  e: 9,  c: C_SUS },
      { s: 10, e: 17, c: C_TRA },
    ]) {
      const sc = PROD_START + g.s, ec = PROD_START + g.e;
      ws.mergeCells(4, sc, 4, ec);
      hdrCell(row.getCell(sc), g.c, "GRIFFO");
    }
    row.commit();
  }

  // Row 5 — Posición
  {
    const row = ws.getRow(5);
    row.height = 22;
    for (let i = 0; i < N_PROD; i++) {
      hdrCell(row.getCell(PROD_START + i), COLS[i].color, COLS[i].pos);
    }
    row.commit();
  }

  // Row 6 — Vehicle labels + Lado
  {
    const row = ws.getRow(6);
    row.height = 24;
    const vehLabels = ["Marca", "Modelo base", "Modelo", "Versión", "Año desde", "Año hasta", "Nombre comercial", "Flota circulante"];
    for (let i = 0; i < vehLabels.length; i++) {
      const cell = row.getCell(i + 1);
      cell.value = vehLabels[i];
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_VEH } };
      cell.alignment = { vertical: "middle" };
    }
    for (let i = 0; i < N_PROD; i++) {
      hdrCell(row.getCell(PROD_START + i), COLS[i].color, COLS[i].lado);
    }
    row.commit();
  }

  // Build vehicle → codes map
  type CobEntry = { v: SpecPartsVehicle; codes: Map<number, string> };
  const vehicleMap = new Map<string, CobEntry>();

  for (const p of products) {
    const colIndices = getCoberturaColIndices(p);
    if (colIndices.length === 0) continue;
    for (const v of p.vehicles ?? []) {
      const brand = (v.brand || "").toUpperCase().trim();
      if (!brand || brand === "AGRALE" || brand === "IVECO" || brand === "UNIVERSAL") continue;
      const key = [
        v.brand, v.master_model, v.model, v.version,
        v.sold_from_year, v.sold_until_year, v.code ?? "",
      ].join("||");
      if (!vehicleMap.has(key)) vehicleMap.set(key, { v, codes: new Map() });
      const entry = vehicleMap.get(key)!;
      for (const colIdx of colIndices) {
        const prev = entry.codes.get(colIdx);
        entry.codes.set(colIdx, prev ? `${prev}; ${p.code}` : p.code);
      }
    }
  }

  // Sort: brand → master_model → model → version → year_from
  const sorted = Array.from(vehicleMap.values()).sort((a, b) => {
    const x = a.v, y = b.v;
    return (
      (x.brand || "").localeCompare(y.brand || "") ||
      (x.master_model || "").localeCompare(y.master_model || "") ||
      (x.model || "").localeCompare(y.model || "") ||
      (x.version || "").localeCompare(y.version || "") ||
      (x.sold_from_year || 0) - (y.sold_from_year || 0)
    );
  });

  // Data rows starting at row 7
  for (let i = 0; i < sorted.length; i++) {
    const { v, codes } = sorted[i];
    const row = ws.getRow(N_HEADER + 1 + i);
    row.getCell(1).value = v.brand;
    row.getCell(2).value = v.master_model;
    row.getCell(3).value = v.model;
    row.getCell(4).value = v.version;
    row.getCell(5).value = v.sold_from_year;
    row.getCell(6).value = v.sold_until_year;
    row.getCell(7).value = v.market_name ?? "";
    row.getCell(8).value = getFlota(v);
    for (let c = 1; c <= N_PROD; c++) {
      const code = codes.get(c);
      if (code) {
        const cell = row.getCell(PROD_START + c - 1);
        cell.value = code;
        cell.font = { bold: true, size: 9 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_CODE } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
    }
    row.commit();
  }

  // Freeze: 8 vehicle cols + 2 sep = 10, rows 1-6
  ws.views = [{ state: "frozen", xSplit: 10, ySplit: 6, topLeftCell: "K7", activeCell: "K7" }];
}
