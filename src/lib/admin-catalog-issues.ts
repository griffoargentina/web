import { listCatalog } from "@/lib/api/specparts";
import { getMercadoLibreUrl } from "@/lib/catalog/utils";
import { productSide } from "@/data/transmision-lado";
import type { CatalogProduct } from "@/types/specparts";

/** Detecta si un producto enabled tiene el dato de ubicación principal cargado
 *  según su línea:
 *  - Transmisión → OK si está en el lookup estático (transmision-lado.ts);
 *                  si no está, revisa los atributos de SpecParts.
 *  - Suspensión  → necesita DELANTERO o TRASERO en los atributos.
 *  - Dirección   → necesita IZQUIERDO o DERECHO en los atributos.
 *  Devuelve el string de lo que falta, o null si está OK (o línea no aplica).
 */
function missingUbicacion(p: CatalogProduct): string | null {
  const cat = (p.category ?? "").toLowerCase();
  const isTransmision = cat.includes("transmi");
  const isSuspension = cat.includes("suspen");
  const isDireccion = cat.includes("direc");
  if (!isTransmision && !isSuspension && !isDireccion) return null;

  if (isTransmision) {
    // El lookup estático (Tabla Aplicaciones de Promotive) es la fuente canónica.
    if (productSide[p.code]) return null;
    // Fallback: atributos de SpecParts (por si el código no está en el lookup).
    const allAttrValues = p.attributes
      .map((a) => (a.value ?? "").toLowerCase())
      .join(" ");
    if (allAttrValues.includes("caja") || allAttrValues.includes("rueda")) return null;
    return "sin LADO CAJA/RUEDA (agregar al lookup)";
  }

  const allAttrValues = p.attributes
    .map((a) => (a.value ?? "").toLowerCase())
    .join(" ");

  if (isSuspension) {
    if (allAttrValues.includes("delan") || allAttrValues.includes("tras")) return null;
    return "sin DELANTERO/TRASERO";
  }
  // isDireccion
  if (allAttrValues.includes("izquier") || allAttrValues.includes("derech")) return null;
  return "sin IZQ/DER";
}

/**
 * Calidad de datos del catálogo de SpecParts. Detecta productos que
 * no tienen los datos necesarios para lucir bien en el sitio público.
 *
 * Todas las calls se derivan del mismo `listCatalog()` cacheado —
 * una sola llamada a SpecParts por render del dashboard.
 */

export type CatalogSummary = {
  total: number;
  byLinea: Record<string, number>;
  byTipo: Record<string, number>;
  /** Productos con al menos 1 foto no-blueprint. */
  conFoto: number;
  sinFoto: number;
  sinVehiculos: number;
  sinAttributes: number;
  sinDescripcion: number;
  discontinuadosPeroEnabled: number;
  updatedUltimos30d: number;
  updatedUltimos90d: number;
  /** Cobertura de links de MercadoLibre (productos enabled + no-discontinued). */
  conMercadoLibre: number;
  sinMercadoLibre: number;
  sinMLList: { code: string; titulo: string }[];
  /** Productos con problemas específicos (para la lista). */
  issues: CatalogIssue[];
  /** Productos de Transmisión/Suspensión/Dirección sin dato de ubicación cargado. */
  sinUbicacion: { code: string; titulo: string; linea: string; falta: string }[];
};

export type CatalogIssue = {
  code: string;
  titulo: string;
  problemas: string[]; // ej. ["sin foto", "sin vehículos"]
};

export async function getCatalogSummary(): Promise<CatalogSummary | null> {
  let products: CatalogProduct[];
  try {
    products = await listCatalog();
  } catch {
    return null;
  }

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const thirty = now - 30 * day;
  const ninety = now - 90 * day;

  const byLinea: Record<string, number> = {};
  const byTipo: Record<string, number> = {};
  let conFoto = 0;
  let sinFoto = 0;
  let sinVehiculos = 0;
  let sinAttributes = 0;
  let sinDescripcion = 0;
  let discontinuadosPeroEnabled = 0;
  let updatedUltimos30d = 0;
  let updatedUltimos90d = 0;
  let conMercadoLibre = 0;
  let sinMercadoLibre = 0;
  const sinMLList: { code: string; titulo: string }[] = [];
  const issues: CatalogIssue[] = [];
  const sinUbicacion: { code: string; titulo: string; linea: string; falta: string }[] = [];

  for (const p of products) {
    const linea = p.category || "Sin línea";
    byLinea[linea] = (byLinea[linea] ?? 0) + 1;

    const tipo = p.product || "Sin tipo";
    byTipo[tipo] = (byTipo[tipo] ?? 0) + 1;

    const hasFoto = p.pictures.some((x) => !x.is_blueprint);
    if (hasFoto) conFoto++;
    else sinFoto++;

    const hasVehiculos = p.vehicles.length > 0;
    const hasAttrs = p.attributes.length > 0;
    const hasDesc = (p.description ?? "").trim().length > 0;
    const discontEnabled = p.discontinued === 1 && p.enabled === 1;

    if (!hasVehiculos) sinVehiculos++;
    if (!hasAttrs) sinAttributes++;
    if (!hasDesc) sinDescripcion++;
    if (discontEnabled) discontinuadosPeroEnabled++;

    if (p.updated_at) {
      const ts = new Date(p.updated_at).getTime();
      if (ts >= thirty) updatedUltimos30d++;
      if (ts >= ninety) updatedUltimos90d++;
    }

    // MercadoLibre — solo contamos productos enabled + no-discontinued.
    if (p.enabled === 1 && !p.discontinued) {
      const titulo = p.product || p.description || p.code;
      if (getMercadoLibreUrl(p)) {
        conMercadoLibre++;
      } else {
        sinMercadoLibre++;
        sinMLList.push({ code: p.code, titulo });
      }
    }

    // Armamos la lista de problemas del producto — solo para productos
    // enabled (los disabled no importan).
    if (p.enabled === 1 && !p.discontinued) {
      const titulo = p.product || p.description || p.code;
      const problemas: string[] = [];
      if (!hasFoto) problemas.push("sin foto");
      if (!hasVehiculos) problemas.push("sin vehículos");
      if (!hasAttrs) problemas.push("sin atributos");
      if (!hasDesc) problemas.push("sin descripción");
      if (problemas.length > 0) {
        issues.push({ code: p.code, titulo, problemas });
      }

      // Chequeo de ubicación según línea.
      const falta = missingUbicacion(p);
      if (falta) {
        const cat = (p.category ?? "").toLowerCase();
        const linea = cat.includes("transmi")
          ? "Transmisión"
          : cat.includes("suspen")
            ? "Suspensión"
            : "Dirección";
        sinUbicacion.push({ code: p.code, titulo, linea, falta });
      }
    }
  }

  // Ordenamos los issues: más problemas primero, después por código.
  issues.sort((a, b) => {
    if (a.problemas.length !== b.problemas.length) {
      return b.problemas.length - a.problemas.length;
    }
    return a.code.localeCompare(b.code);
  });

  sinMLList.sort((a, b) => a.code.localeCompare(b.code));
  sinUbicacion.sort((a, b) =>
    a.linea.localeCompare(b.linea) || a.code.localeCompare(b.code)
  );

  return {
    total: products.length,
    byLinea,
    byTipo,
    conFoto,
    sinFoto,
    sinVehiculos,
    sinAttributes,
    sinDescripcion,
    discontinuadosPeroEnabled,
    updatedUltimos30d,
    updatedUltimos90d,
    conMercadoLibre,
    sinMercadoLibre,
    sinMLList,
    issues,
    sinUbicacion,
  };
}
