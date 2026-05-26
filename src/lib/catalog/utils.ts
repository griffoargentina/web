/**
 * Utilidades puras para el catálogo. Sirven tanto en server como en client.
 * Ported de la app mobile (app.griffo.com.ar v2.11).
 */

import type {
  CatalogProduct,
  IndexedProduct,
  SpecPartsProduct,
  SpecPartsVehicle,
} from "@/types/specparts";

/**
 * Campos de SpecParts que nunca usamos en el cliente — se stripean antes
 * de serializar el payload al browser para reducir ~10-15% el HTML.
 *
 * Algunos vienen siempre vacíos (seller, company_id, observation,
 * national_industry), otros son redundantes (safe_code = code sin
 * guiones) o no-renderizados (oem top-level). El resto del shape queda
 * igual — sí mantenemos cross, reference, ean, components porque
 * alimentan la búsqueda por palabra (ver buildSearchText).
 *
 * Usar SÓLO para payloads que van al browser. El backup y otros
 * consumidores server-side usan la data cruda de listCatalog().
 */
export function stripForClient(p: CatalogProduct): CatalogProduct {
  const {
    safe_code: _safe,
    observation: _obs,
    oem: _oem,
    national_industry: _nat,
    seller: _sel,
    company_id: _cid,
    ...rest
  } = p;
  // Cast: el tipo original pide estos campos aunque sean unused. Los
  // dejamos como defaults neutros para no romper consumidores que
  // accedan con `?.` o a un array vacío.
  return rest as CatalogProduct;
}

export function stripProductsForClient(products: CatalogProduct[]): CatalogProduct[] {
  return products.map(stripForClient);
}

/** Marcas que se excluyen del filtro de "Por Vehículo" (no se venden en AR). */
const EXCLUDED_VEHICLE_BRANDS = new Set(["AGRALE", "IVECO", "UNIVERSAL"]);

export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Link de MercadoLibre — la API lo devuelve en `links[]` con key `link` o `url`. */
export function getMercadoLibreUrl(product: SpecPartsProduct): string | null {
  const links = product.links ?? [];
  for (const l of links) {
    const candidate = l.url ?? l.link;
    if (candidate) return candidate;
  }
  return null;
}

/* ========= Búsqueda por palabra ========= */

/**
 * Construye el texto de búsqueda para un producto. Concatena code,
 * description, product, category, slug, vehicles, attributes, components,
 * cross, reference, ean — todo normalizado (lowercase sin acentos).
 * Se invoca una vez en el cliente tras recibir el payload y se cachea.
 */
export function buildSearchText(p: SpecPartsProduct): string {
  const parts: string[] = [p.code, p.description, p.product, p.category, p.slug];
  for (const v of p.vehicles ?? []) {
    parts.push(v.brand, v.master_model, v.model, v.version);
  }
  for (const a of p.attributes ?? []) {
    parts.push(a.name, a.value, a.unit);
  }
  for (const c of p.components ?? []) {
    parts.push(c.code, c.product);
  }
  for (const c of p.cross ?? []) {
    parts.push(c.brand, c.code);
  }
  for (const r of p.reference ?? []) {
    parts.push(r.brand, r.code);
  }
  for (const e of p.ean ?? []) {
    parts.push(e);
  }
  return normalizeSearch(parts.filter(Boolean).join(" "));
}

export function indexProducts(products: CatalogProduct[]): IndexedProduct[] {
  return products.map((p) => ({ ...p, _searchText: buildSearchText(p) }));
}

export function searchByKeyword(products: IndexedProduct[], query: string): IndexedProduct[] {
  const normalized = normalizeSearch(query.trim());
  if (!normalized) return [];
  const words = normalized.split(/\s+/).filter(Boolean);
  return products.filter((p) => words.every((w) => p._searchText.includes(w)));
}

/* ========= Búsqueda por código ========= */

export function searchByCode(products: CatalogProduct[], code: string): CatalogProduct[] {
  const q = code.trim().toLowerCase();
  if (!q) return [];
  return products.filter((p) => p.code?.toLowerCase().includes(q));
}

/* ========= Árbol de vehículos (para selects cascada) ========= */

export type VehicleTree = {
  brands: string[];
  modelsByBrand: Record<string, string[]>;
  yearsByBrandModel: Record<string, number[]>;
};

export function buildVehicleTree(products: CatalogProduct[]): VehicleTree {
  const brands = new Set<string>();
  const modelsByBrand = new Map<string, Set<string>>();
  const yearsByBrandModel = new Map<string, Set<number>>();

  for (const p of products) {
    for (const v of p.vehicles ?? []) {
      if (!v.brand || EXCLUDED_VEHICLE_BRANDS.has(v.brand)) continue;
      brands.add(v.brand);

      if (v.master_model) {
        if (!modelsByBrand.has(v.brand)) modelsByBrand.set(v.brand, new Set());
        modelsByBrand.get(v.brand)!.add(v.master_model);

        const key = `${v.brand}|${v.master_model}`;
        if (!yearsByBrandModel.has(key)) yearsByBrandModel.set(key, new Set());
        const yearsSet = yearsByBrandModel.get(key)!;
        const from = v.sold_from_year || 0;
        const until = v.sold_until_year || from;
        for (let y = from; y <= until; y += 1) {
          if (y > 1950 && y < 2100) yearsSet.add(y);
        }
      }
    }
  }

  const brandList = Array.from(brands).sort();
  const modelsByBrandOut: Record<string, string[]> = {};
  for (const [brand, models] of modelsByBrand.entries()) {
    modelsByBrandOut[brand] = Array.from(models).sort();
  }
  const yearsByBrandModelOut: Record<string, number[]> = {};
  for (const [key, years] of yearsByBrandModel.entries()) {
    yearsByBrandModelOut[key] = Array.from(years).sort((a, b) => b - a);
  }

  return {
    brands: brandList,
    modelsByBrand: modelsByBrandOut,
    yearsByBrandModel: yearsByBrandModelOut,
  };
}

export function searchByVehicle(
  products: CatalogProduct[],
  filters: { brand: string; model?: string; year?: number },
): CatalogProduct[] {
  if (!filters.brand) return [];
  return products.filter((p) => {
    if (!p.vehicles?.length) return false;
    return p.vehicles.some((v) => {
      if (v.brand !== filters.brand) return false;
      if (filters.model && v.master_model !== filters.model) return false;
      if (filters.year) {
        if (filters.year < v.sold_from_year || filters.year > v.sold_until_year) return false;
      }
      return true;
    });
  });
}

/* ========= Búsqueda por patente ========= */

export function filterByPlateVehicle(
  products: CatalogProduct[],
  plateVehicle: { brand?: string; master_model?: string; model?: string },
): CatalogProduct[] {
  if (!plateVehicle.brand) return [];
  return products.filter((p) => {
    if (!p.vehicles?.length) return false;
    return p.vehicles.some((v) => {
      if (v.brand !== plateVehicle.brand) return false;
      if (plateVehicle.master_model && v.master_model === plateVehicle.master_model) return true;
      if (plateVehicle.model && v.model === plateVehicle.model) return true;
      return false;
    });
  });
}

/* ========= Búsqueda por medidas ========= */

export type MeasureType = "direccion" | "transmision" | "tope";

export type MeasureVersion = {
  code: string;
  /** Nombre del producto (ej. 'FUELLE SEMIEJE', 'KIT FUELLE SEMIEJE'). */
  product: string;
  /** Descripción corta del producto. */
  description: string;
  productSlug: string;
  imageUrl: string | null;
  /** Vehículos compatibles (para mostrar el resumen 'FORD (KUGA - RANGER)...'). */
  vehicles: SpecPartsVehicle[];
};

export type MeasureRow = {
  /** Código mostrado: base si isGrouped (ej. '162'), completo si no (ej. '054-122-03'). */
  code: string;
  /** True si esta fila agrupa más de un producto con el mismo código base. */
  isGrouped: boolean;
  /** Lista de versiones. Si no está agrupada, tiene 1 elemento. */
  versions: MeasureVersion[];
  diamMenor: string;
  diamMayor: string;
  largo: string;
  diamMenorNum: number | null;
  diamMayorNum: number | null;
  largoNum: number | null;
  /** Slug del primer producto — para retrocompat de llamadas single-click. */
  productSlug: string;
  /** Imagen representativa (la del primer producto del grupo). */
  imageUrl: string | null;
  /** Nombre del primer producto — usado como alt de imagen, etc. */
  productName: string;
};

function isFuelleDireccion(p: SpecPartsProduct): boolean {
  const haystack = `${p.product ?? ""} ${p.description ?? ""}`.toLowerCase();
  return haystack.includes("fuelle") && haystack.includes("cremallera");
}

function isFuelleTransmision(p: SpecPartsProduct): boolean {
  const haystack = `${p.product ?? ""} ${p.description ?? ""}`.toLowerCase();
  return haystack.includes("fuelle") && haystack.includes("semieje");
}

function isTope(p: SpecPartsProduct): boolean {
  const haystack = `${p.product ?? ""} ${p.description ?? ""} ${p.category ?? ""}`.toLowerCase();
  return haystack.includes("tope") && !haystack.includes("fuelle");
}

function getBaseCode(code: string): string {
  const match = code.match(/^(\d+)/);
  return match ? match[1] : code;
}

export function getAttrValue(p: SpecPartsProduct, nameContains: string): string {
  return getAttrValues(p, nameContains)[0] ?? "";
}

/**
 * Devuelve TODOS los valores de attributes cuyo nombre matchea. Un mismo
 * producto puede tener múltiples attributes con el mismo nombre (ej. dos
 * entradas "Lado" cuando aplica a izquierdo y derecho a la vez).
 */
export function getAttrValues(p: SpecPartsProduct, nameContains: string): string[] {
  if (!p.attributes) return [];
  const needle = nameContains.toLowerCase();
  const out: string[] = [];
  for (const a of p.attributes) {
    const name = (a.name ?? "").toLowerCase();
    if (!name.includes(needle)) continue;
    const value = a.value ?? "";
    const unit = a.unit ?? "";
    const full = unit ? `${value} ${unit}` : value;
    if (full && !out.includes(full)) out.push(full);
  }
  return out;
}

/**
 * Ubicación del producto en el vehículo (ej. DELANTERO, TRASERO, LADO RUEDA).
 * SpecParts no tiene un nombre de campo consistente — a veces es "Ubicación",
 * a veces "Posición", "Eje", "Montaje". Probamos varios en orden y si ninguno
 * matchea, caemos al fallback de buscar cualquier attribute cuyo VALOR sea
 * DELANTERO/TRASERO.
 */
const LOCATION_ATTR_NAMES = ["ubicaci", "posici", "eje", "montaje"];
const LOCATION_VALUES = new Set([
  "DELANTERO",
  "DELANTERA",
  "TRASERO",
  "TRASERA",
  "LADO RUEDA",
  "LADO CAJA",
]);

export function getProductLocation(p: SpecPartsProduct): string {
  return getProductLocations(p)[0] ?? "";
}

export function getProductLocations(p: SpecPartsProduct): string[] {
  const out: string[] = [];
  for (const needle of LOCATION_ATTR_NAMES) {
    for (const v of getAttrValues(p, needle)) {
      if (!out.includes(v)) out.push(v);
    }
  }
  if (out.length > 0) return out;
  if (!p.attributes) return [];
  for (const a of p.attributes) {
    const val = (a.value ?? "").trim().toUpperCase();
    if (LOCATION_VALUES.has(val) && !out.includes(val)) out.push(val);
  }
  return out;
}

function toNumber(value: string): number | null {
  if (!value) return null;
  const n = parseFloat(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toMeasureVersion(p: SpecPartsProduct): MeasureVersion {
  return {
    code: p.code ?? "",
    product: p.product || "",
    description: p.description || "",
    productSlug: p.slug,
    imageUrl: p.pictures?.[0]?.image_url ?? null,
    vehicles: p.vehicles ?? [],
  };
}

function buildMeasureRow(
  representative: SpecPartsProduct,
  opts?: { codeOverride?: string; versions?: SpecPartsProduct[] },
): MeasureRow {
  const diamMayor =
    getAttrValue(representative, "boca mayor") ||
    getAttrValue(representative, "diámetro mayor");
  const diamMenor =
    getAttrValue(representative, "boca menor") ||
    getAttrValue(representative, "diámetro menor");
  const largo = getAttrValue(representative, "largo");
  const productsInRow = opts?.versions ?? [representative];
  const versions = productsInRow.map(toMeasureVersion);
  const isGrouped = versions.length > 1;
  return {
    // Si está agrupada y hay codeOverride, mostramos el base.
    // Si es única, mostramos el código completo real.
    code: isGrouped ? opts?.codeOverride ?? representative.code ?? "" : representative.code ?? "",
    isGrouped,
    versions,
    diamMayor,
    diamMenor,
    largo,
    diamMayorNum: toNumber(diamMayor),
    diamMenorNum: toNumber(diamMenor),
    largoNum: toNumber(largo),
    productSlug: representative.slug,
    imageUrl: representative.pictures?.[0]?.image_url ?? null,
    productName: representative.product || representative.description || "",
  };
}

export function buildMeasureRows(
  products: CatalogProduct[],
  type: MeasureType,
): MeasureRow[] {
  if (type === "transmision") {
    // Agrupamos por código base (ej. '162' agrupa 162-12, 162-32, 162-32A...).
    // Si el grupo tiene 1 solo producto, la fila muestra el código completo.
    // Si tiene varios, muestra el base + se abre modal con las versiones.
    const byBase = new Map<string, SpecPartsProduct[]>();
    for (const p of products) {
      if (!isFuelleTransmision(p)) continue;
      const base = getBaseCode(p.code);
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base)!.push(p);
    }
    const rows: MeasureRow[] = [];
    for (const [base, prods] of byBase.entries()) {
      if (prods.length === 0) continue;
      // Ordenamos versiones por código (con sufijos). FUELLE solo suele ser -12
      // y kits -32/-32A/-32B. Al ordenar por código, el -12 queda primero, lo
      // cual es útil porque sus medidas son las más 'canonicas' del fuelle.
      prods.sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""));
      const representative = prods[0];
      rows.push(
        buildMeasureRow(representative, {
          codeOverride: base,
          versions: prods,
        }),
      );
    }
    return rows;
  }

  const predicate = type === "direccion" ? isFuelleDireccion : isTope;
  return products.filter(predicate).map((p) => buildMeasureRow(p));
}

/* ========= Suspensión: tabla unificada topes + fuelles ========= */

export type SuspensionMeasureRow = {
  code: string;
  productSlug: string;
  productName: string;
  imageUrl: string | null;
  vehicles: SpecPartsVehicle[];
  /** True si el producto incluye fuelle (standalone o en kit). */
  hasFuelle: boolean;
  /** True si el producto incluye tope (standalone o en kit). */
  hasTope: boolean;
  // Fuelle
  diamMenorFuelle: string;
  diamMayorFuelle: string;
  largoFuelle: string;
  diamMenorFuelleNum: number | null;
  diamMayorFuelleNum: number | null;
  largoFuelleNum: number | null;
  // Tope
  diamInternoTope: string;
  largoTope: string;
  diamInternoTopeNum: number | null;
  largoTopeNum: number | null;
};

/**
 * Detecta si un producto pertenece a la línea Suspensión:
 * topes, fuelles de suspensión y kits que combinan ambos.
 * Excluye fuelles de dirección (cremallera) y transmisión (semieje)
 * que ya tienen su propia pestaña.
 */
function isSuspension(p: SpecPartsProduct): boolean {
  const h =
    `${p.product ?? ""} ${p.description ?? ""} ${p.category ?? ""}`.toLowerCase();
  const hasTope = h.includes("tope");
  const hasFuelle = h.includes("fuelle");
  if (!hasTope && !hasFuelle) return false;
  // Excluir cremallera (dirección) y semieje (transmisión)
  if (hasFuelle && !hasTope) {
    if (h.includes("cremallera") || h.includes("semieje")) return false;
  }
  return true;
}

export function buildSuspensionMeasureRows(
  products: CatalogProduct[],
): SuspensionMeasureRow[] {
  return products
    .filter(isSuspension)
    .map((p): SuspensionMeasureRow => {
      const h = `${p.product ?? ""} ${p.description ?? ""}`.toLowerCase();
      const hasFuelle = h.includes("fuelle");
      const hasTope = h.includes("tope");

      // Medidas del fuelle: boca menor/mayor + largo fuelle.
      // Para kits, SpecParts debería exponer "largo fuelle" específico.
      // Para fuelle solo, cae a "largo" genérico.
      const diamMenorFuelle = hasFuelle
        ? getAttrValue(p, "boca menor") ||
          getAttrValue(p, "diámetro menor") ||
          getAttrValue(p, "diam. menor")
        : "";
      const diamMayorFuelle = hasFuelle
        ? getAttrValue(p, "boca mayor") ||
          getAttrValue(p, "diámetro mayor") ||
          getAttrValue(p, "diam. mayor")
        : "";
      const largoFuelle = hasFuelle
        ? getAttrValue(p, "largo fuelle") ||
          getAttrValue(p, "long. fuelle") ||
          (!hasTope ? getAttrValue(p, "largo") : "")
        : "";

      // Medidas del tope: diámetro interior + largo tope.
      const diamInternoTope = hasTope
        ? getAttrValue(p, "diámetro interior") ||
          getAttrValue(p, "diámetro interno") ||
          getAttrValue(p, "diam. interior") ||
          getAttrValue(p, "diam. interno")
        : "";
      const largoTope = hasTope
        ? getAttrValue(p, "largo tope") ||
          getAttrValue(p, "long. tope") ||
          (!hasFuelle ? getAttrValue(p, "largo") : "")
        : "";

      return {
        code: p.code ?? "",
        productSlug: p.slug,
        productName: p.product || p.description || "",
        imageUrl: p.pictures?.[0]?.image_url ?? null,
        vehicles: p.vehicles ?? [],
        hasFuelle,
        hasTope,
        diamMenorFuelle,
        diamMayorFuelle,
        largoFuelle,
        diamMenorFuelleNum: toNumber(diamMenorFuelle),
        diamMayorFuelleNum: toNumber(diamMayorFuelle),
        largoFuelleNum: toNumber(largoFuelle),
        diamInternoTope,
        largoTope,
        diamInternoTopeNum: toNumber(diamInternoTope),
        largoTopeNum: toNumber(largoTope),
      };
    });
}
