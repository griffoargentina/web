/**
 * Tipos del schema de SpecParts (external-api.specparts.ai).
 * Basado en el schema real del endpoint /part/list devuelto en producción (abril 2026).
 *
 * Campos confiables (siempre presentes y útiles):
 *   id, slug, code, safe_code, brand, category, product, description,
 *   is_kit, discontinued, enabled, updated_at
 *
 * Campos parciales (pueden venir vacíos):
 *   pictures, vehicles, attributes, cross, links
 *
 * Campos que siempre vienen vacíos — no usar:
 *   package_*, observation, seller, company_id, components (los 188 kits vienen sin cargar)
 *
 * No hay stock ni precio en la API.
 */

export type SpecPartsPicture = {
  is_blueprint: 0 | 1;
  image_url: string;
  sort_order: number;
};

export type SpecPartsAttribute = {
  name: string;
  value: string;
  unit: string;
};

export type SpecPartsVehicle = {
  market_name?: string;
  /** Código Promotive — identifica el vehículo en la Tabla de Aplicaciones. */
  code?: string;
  brand: string;
  master_model: string;
  model: string;
  version: string;
  sold_from_year: number;
  sold_until_year: number;
  /**
   * Detalle de aplicación cargado por SpecParts desde la observación pieza-vehículo
   * de la Tabla de Aplicaciones interna. Ejemplos:
   *  - "Semiejes Izq y Der / Lado Rueda"
   *  - "Semieje Izq / Lado Caja"
   *  - "Cremallera Der"
   * Fuente canónica para IZQ/DER y CAJA/RUEDA — reemplaza el lookup de Excel.
   */
  application_details?: string;
};

export type SpecPartsCross = {
  brand: string;
  code: string;
  oem?: 0 | 1;
};

export type SpecPartsLink = {
  link?: string;
  url?: string;
  image?: string;
};

export type SpecPartsComponent = {
  code: string;
  product: string;
};

export type SpecPartsProduct = {
  id: number;
  slug: string;
  brand: string;
  category: string;
  product: string;
  code: string;
  safe_code: string;
  description: string;
  observation: string | null;
  is_kit: 0 | 1;
  oem: 0 | 1;
  national_industry: unknown;
  discontinued: 0 | 1;
  enabled: 0 | 1;
  updated_at: string;
  pictures: SpecPartsPicture[];
  components: SpecPartsComponent[];
  links: SpecPartsLink[];
  reference?: SpecPartsCross[];
  cross: SpecPartsCross[];
  attributes: SpecPartsAttribute[];
  vehicles: SpecPartsVehicle[];
  seller: unknown[];
  ean: string[];
  company_id: unknown[];
};

export type SpecPartsListResponse = {
  data: SpecPartsProduct[];
  paging?: { pages?: number };
};

export type SpecPartsPlateResponse = {
  brand?: string;
  master_model?: string;
  model?: string;
  version?: string;
  sold_from_year?: number;
  sold_until_year?: number;
  error?: string;
};

/**
 * Alias de SpecPartsProduct usado por el catálogo. No contiene índice de
 * búsqueda — ese se construye client-side con `buildSearchIndex()` para
 * ahorrar payload en el response inicial (~150KB gzipped menos).
 */
export type CatalogProduct = SpecPartsProduct;

/**
 * Producto enriquecido con índice de búsqueda en memoria (solo cliente).
 */
export type IndexedProduct = CatalogProduct & {
  _searchText: string;
};
