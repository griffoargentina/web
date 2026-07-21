/**
 * Filtros facetados del catálogo.
 *
 * Funciona estilo Mercado Libre:
 *  - Multi-select dentro de cada grupo (OR interno)
 *  - Entre grupos distintos: AND
 *  - Contadores por opción calculados con exclusión de su propia facet.
 *
 * Grupos:
 *   linea      → product.category
 *   tipo       → kit | fuelle | tope (derivado de is_kit + product)
 *   ubicacion  → attribute cuyo name incluye "ubicaci"
 *   lado       → attribute cuyo name incluye "lado", expandido:
 *                "izquierdo y/o derecho (según vehículo)" matchea tanto
 *                Izquierdo como Derecho para que no se esconda del filtro.
 *   marca      → vehicles[].brand (excluye AGRALE, IVECO, UNIVERSAL)
 *   modelo     → vehicles[].master_model (dependiente de marca)
 *   motor      → vehicles[].version (dependiente de modelo)
 *   anio       → años entre sold_from_year y sold_until_year (dependiente de modelo)
 *
 * Los filtros de vehículo (marca+modelo+motor+anio) se chequean contra el
 * MISMO vehicle del array para no cruzar datos. Un producto califica si
 * tiene al menos UN vehicle que cumpla TODOS los criterios tildados.
 */

import type { CatalogProduct, SpecPartsProduct, SpecPartsVehicle } from "@/types/specparts";
import { getAttrValues, getProductLocations } from "./utils";

export type FilterGroup =
  | "linea"
  | "tipo"
  | "ubicacion"
  | "lado"
  | "marca"
  | "modelo"
  | "motor"
  | "anio";

export type CatalogFilters = {
  linea: Set<string>;
  tipo: Set<string>;
  ubicacion: Set<string>;
  lado: Set<string>;
  marca: Set<string>;
  modelo: Set<string>;
  motor: Set<string>;
  anio: Set<string>;
};

export type TipoKey = "kit" | "fuelle" | "tope";

export type Facet = { value: string; count: number };

const EXCLUDED_BRANDS = new Set(["AGRALE", "IVECO", "UNIVERSAL"]);

const ALL_GROUPS: FilterGroup[] = [
  "linea",
  "tipo",
  "ubicacion",
  "lado",
  "marca",
  "modelo",
  "motor",
  "anio",
];

function cloneFilters(f: CatalogFilters): CatalogFilters {
  return {
    linea: new Set(f.linea),
    tipo: new Set(f.tipo),
    ubicacion: new Set(f.ubicacion),
    lado: new Set(f.lado),
    marca: new Set(f.marca),
    modelo: new Set(f.modelo),
    motor: new Set(f.motor),
    anio: new Set(f.anio),
  };
}

export function emptyFilters(): CatalogFilters {
  return {
    linea: new Set(),
    tipo: new Set(),
    ubicacion: new Set(),
    lado: new Set(),
    marca: new Set(),
    modelo: new Set(),
    motor: new Set(),
    anio: new Set(),
  };
}

export function hasActiveFilters(f: CatalogFilters): boolean {
  return ALL_GROUPS.some((k) => f[k].size > 0);
}

export function countActiveFilters(f: CatalogFilters): number {
  let total = 0;
  for (const k of ALL_GROUPS) total += f[k].size;
  return total;
}

export function toggleFilter(f: CatalogFilters, group: FilterGroup, value: string): CatalogFilters {
  const next = cloneFilters(f);
  const set = next[group];
  if (set.has(value)) set.delete(value);
  else set.add(value);

  // Cascada hacia abajo: al vaciar un filtro, los dependientes se limpian.
  if (group === "marca" && next.marca.size === 0) {
    next.modelo = new Set();
    next.motor = new Set();
    next.anio = new Set();
  }
  if (group === "modelo" && next.modelo.size === 0) {
    next.motor = new Set();
    next.anio = new Set();
  }
  return next;
}

export function clearGroup(f: CatalogFilters, group: FilterGroup): CatalogFilters {
  const next = cloneFilters(f);
  next[group] = new Set();
  if (group === "marca") {
    next.modelo = new Set();
    next.motor = new Set();
    next.anio = new Set();
  }
  if (group === "modelo") {
    next.motor = new Set();
    next.anio = new Set();
  }
  return next;
}

/* -------------------------------------------------------------------------- */
/*  Clasificación y normalización                                              */
/* -------------------------------------------------------------------------- */

export function classifyTipo(p: SpecPartsProduct): TipoKey | null {
  const name = (p.product || "").toUpperCase();
  if (p.is_kit === 1 || name.includes("KIT")) return "kit";
  if (name.includes("FUELLE")) return "fuelle";
  if (name.includes("TOPE")) return "tope";
  return null;
}

export function expandLadoValue(raw: string): string[] {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!cleaned) return [];
  const looksAmbos =
    cleaned.includes("segun vehiculo") ||
    cleaned.includes("y/o") ||
    cleaned.includes(" o ") ||
    cleaned.includes("ambos");
  if (looksAmbos) return ["izquierdo", "derecho"];
  return [cleaned];
}

export function displayLadoLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* -------------------------------------------------------------------------- */
/*  Matching                                                                   */
/* -------------------------------------------------------------------------- */

/** True si TODOS los criterios de vehicle tildados se cumplen en ESTE vehicle. */
function vehicleMatches(
  v: SpecPartsVehicle,
  f: CatalogFilters,
  opts: { skip?: FilterGroup },
): boolean {
  const { skip } = opts;

  if (skip !== "marca" && f.marca.size > 0) {
    if (!v.brand || !f.marca.has(v.brand.toUpperCase())) return false;
  }
  if (skip !== "modelo" && f.modelo.size > 0) {
    if (!v.master_model || !f.modelo.has(v.master_model.toUpperCase())) return false;
  }
  if (skip !== "motor" && f.motor.size > 0) {
    if (!v.version || !f.motor.has(v.version.toUpperCase())) return false;
  }
  if (skip !== "anio" && f.anio.size > 0) {
    const from = v.sold_from_year ?? 0;
    const to = v.sold_until_year ?? from;
    const yearHits = Array.from(f.anio).some((year) => {
      const y = parseInt(year, 10);
      return Number.isFinite(y) && y >= from && y <= to;
    });
    if (!yearHits) return false;
  }
  return true;
}

export function matchesFilters(
  p: CatalogProduct,
  f: CatalogFilters,
  opts: { skip?: FilterGroup } = {},
): boolean {
  const { skip } = opts;

  if (skip !== "linea" && f.linea.size > 0) {
    if (!f.linea.has((p.category || "").toUpperCase())) return false;
  }

  if (skip !== "tipo" && f.tipo.size > 0) {
    const t = classifyTipo(p);
    if (!t || !f.tipo.has(t)) return false;
  }

  if (skip !== "ubicacion" && f.ubicacion.size > 0) {
    const locs = getProductLocations(p).map((l) => l.toUpperCase().trim()).filter(Boolean);
    if (!locs.some((l) => f.ubicacion.has(l))) return false;
  }

  if (skip !== "lado" && f.lado.size > 0) {
    const expanded = new Set<string>();
    for (const raw of getAttrValues(p, "lado")) {
      for (const v of expandLadoValue(raw)) expanded.add(v);
    }
    let hit = false;
    for (const v of expanded) {
      if (f.lado.has(v)) {
        hit = true;
        break;
      }
    }
    if (!hit) return false;
  }

  // Filtros de vehículo: marca/modelo/motor/año tienen que alinear en
  // el mismo vehicle, si no estaríamos cruzando datos.
  const vehicleActive =
    (skip !== "marca" && f.marca.size > 0) ||
    (skip !== "modelo" && f.modelo.size > 0) ||
    (skip !== "motor" && f.motor.size > 0) ||
    (skip !== "anio" && f.anio.size > 0);
  if (vehicleActive) {
    const vehicles = p.vehicles ?? [];
    const hit = vehicles.some((v) => vehicleMatches(v, f, opts));
    if (!hit) return false;
  }

  return true;
}

export function applyFilters(products: CatalogProduct[], f: CatalogFilters): CatalogProduct[] {
  return products.filter((p) => matchesFilters(p, f));
}

/* -------------------------------------------------------------------------- */
/*  Ordenamiento de resultados                                                  */
/* -------------------------------------------------------------------------- */

function linePriority(category: string): number {
  const c = category.toLowerCase();
  if (c.includes("direc")) return 0;
  if (c.includes("transm") || c.includes("semiej")) return 1;
  if (c.includes("suspen") || c.includes("tope")) return 2;
  return 3;
}

/**
 * Ordena la grilla de resultados con dos niveles:
 *   1. Línea: Dirección → Transmisión → Suspensión → otros
 *   2. Código: alfanumérico natural (213-12 < 213-32C, 121-32 < 213-12)
 */
export function sortResultProducts(products: CatalogProduct[]): CatalogProduct[] {
  return [...products].sort((a, b) => {
    const la = linePriority(a.category ?? "");
    const lb = linePriority(b.category ?? "");
    if (la !== lb) return la - lb;
    return (a.code ?? "").localeCompare(b.code ?? "", "es", { numeric: true });
  });
}

/* -------------------------------------------------------------------------- */
/*  Facets (con contadores)                                                    */
/* -------------------------------------------------------------------------- */

export type Facets = {
  linea: Facet[];
  tipo: Facet[];
  ubicacion: Facet[];
  lado: Facet[];
  marca: Facet[];
  modelo: Facet[];
  motor: Facet[];
  anio: Facet[];
};

export function computeFacets(products: CatalogProduct[], f: CatalogFilters): Facets {
  const facetFor = (group: FilterGroup): Facet[] => {
    const filtered = products.filter((p) => matchesFilters(p, f, { skip: group }));
    const counts = new Map<string, number>();

    for (const p of filtered) {
      const values = extractValues(p, group, f);
      for (const v of values) {
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => {
        // Año: orden descendente numérico (más nuevo arriba).
        if (group === "anio") {
          return parseInt(b.value, 10) - parseInt(a.value, 10);
        }
        return a.value.localeCompare(b.value, "es");
      });
  };

  return {
    linea: facetFor("linea"),
    tipo: facetFor("tipo"),
    ubicacion: facetFor("ubicacion"),
    lado: facetFor("lado"),
    marca: facetFor("marca"),
    // Modelo: depende de marca. Motor y Año: dependen de modelo.
    modelo: f.marca.size > 0 ? facetFor("modelo") : [],
    motor: f.modelo.size > 0 ? facetFor("motor") : [],
    anio: f.modelo.size > 0 ? facetFor("anio") : [],
  };
}

function extractValues(p: CatalogProduct, group: FilterGroup, f: CatalogFilters): string[] {
  switch (group) {
    case "linea": {
      const v = (p.category || "").toUpperCase().trim();
      return v ? [v] : [];
    }
    case "tipo": {
      const t = classifyTipo(p);
      return t ? [t] : [];
    }
    case "ubicacion": {
      return getProductLocations(p)
        .map((l) => l.toUpperCase().trim())
        .filter(Boolean);
    }
    case "lado": {
      const out = new Set<string>();
      for (const raw of getAttrValues(p, "lado")) {
        for (const v of expandLadoValue(raw)) out.add(v);
      }
      return Array.from(out);
    }
    case "marca": {
      const brands = new Set<string>();
      for (const v of p.vehicles ?? []) {
        if (!v.brand) continue;
        const b = v.brand.toUpperCase();
        if (EXCLUDED_BRANDS.has(b)) continue;
        brands.add(b);
      }
      return Array.from(brands);
    }
    case "modelo": {
      const models = new Set<string>();
      for (const v of p.vehicles ?? []) {
        if (!v.master_model) continue;
        const brand = (v.brand || "").toUpperCase();
        if (f.marca.size > 0 && !f.marca.has(brand)) continue;
        if (EXCLUDED_BRANDS.has(brand)) continue;
        models.add(v.master_model.toUpperCase());
      }
      return Array.from(models);
    }
    case "motor": {
      const motors = new Set<string>();
      for (const v of p.vehicles ?? []) {
        if (!v.version) continue;
        const brand = (v.brand || "").toUpperCase();
        const model = (v.master_model || "").toUpperCase();
        if (EXCLUDED_BRANDS.has(brand)) continue;
        if (f.marca.size > 0 && !f.marca.has(brand)) continue;
        if (f.modelo.size > 0 && !f.modelo.has(model)) continue;
        motors.add(v.version.toUpperCase());
      }
      return Array.from(motors);
    }
    case "anio": {
      const years = new Set<string>();
      for (const v of p.vehicles ?? []) {
        const brand = (v.brand || "").toUpperCase();
        const model = (v.master_model || "").toUpperCase();
        const version = (v.version || "").toUpperCase();
        if (EXCLUDED_BRANDS.has(brand)) continue;
        if (f.marca.size > 0 && !f.marca.has(brand)) continue;
        if (f.modelo.size > 0 && !f.modelo.has(model)) continue;
        if (f.motor.size > 0 && !f.motor.has(version)) continue;
        const from = v.sold_from_year;
        const to = v.sold_until_year ?? from;
        if (!from) continue;
        for (let y = from; y <= (to ?? from); y += 1) {
          if (y > 1950 && y < 2100) years.add(String(y));
        }
      }
      return Array.from(years);
    }
  }
}
