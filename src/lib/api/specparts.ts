/**
 * Cliente de SpecParts (external-api.specparts.ai) — SERVER ONLY.
 *
 * ⚠️ REGLA CRÍTICA DEL PROXY:
 * Para GET a /part/list y otros endpoints con `brand[]=GRIFFO` usamos el módulo
 * nativo `https` + `zlib`, NUNCA `fetch()`. `fetch()` re-codifica los brackets
 * (`brand[]` → `brand%5B%5D`) y SpecParts devuelve ~5 productos en vez de ~370.
 * Bug confirmado en producción de la app mobile.
 *
 * `fetch()` SÍ se puede usar para el POST de auth (no hay query params con
 * brackets que preservar).
 *
 * Cache: ~370 productos en memoria del proceso, TTL 30 min.
 */

import https from "node:https";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import type {
  CatalogProduct,
  SpecPartsListResponse,
  SpecPartsPlateResponse,
  SpecPartsProduct,
} from "@/types/specparts";

const gunzipAsync = promisify(gunzip);

const API_HOST = "external-api.specparts.ai";
const AUTH_URL = "https://auth.specparts.ai/oauth";
const CACHE_TTL_MS = 30 * 60 * 1000;

type TokenCache = { token: string; expiresAt: number };
type ProductsCache = { products: CatalogProduct[]; expiresAt: number };

let tokenCache: TokenCache | null = null;
let productsCache: ProductsCache | null = null;
let inflightProducts: Promise<CatalogProduct[]> | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const clientId = process.env.SPECPARTS_CLIENT_ID;
  const clientSecret = process.env.SPECPARTS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("SPECPARTS_CLIENT_ID y SPECPARTS_CLIENT_SECRET no configurados");
  }

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`SpecParts auth falló (${res.status})`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("SpecParts auth: respuesta sin access_token");

  tokenCache = { token: data.access_token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return data.access_token;
}

/**
 * GET a SpecParts con `https` nativo. Preserva la URL literal (brackets, etc).
 * No usar `fetch()` acá — ver nota al tope del archivo.
 */
function specpartsGet<T>(path: string, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(
        {
          hostname: API_HOST,
          path,
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Accept-Encoding": "gzip",
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", async () => {
            const buffer = Buffer.concat(chunks);
            try {
              const body =
                res.headers["content-encoding"] === "gzip"
                  ? (await gunzipAsync(buffer)).toString("utf8")
                  : buffer.toString("utf8");
              const status = res.statusCode ?? 0;
              if (status === 429) {
                reject(new Error(`SpecParts rate limit (429): ${body.slice(0, 100)}`));
                return;
              }
              if (status >= 400) {
                reject(new Error(`SpecParts ${path} → ${status}: ${body.slice(0, 200)}`));
                return;
              }
              resolve(JSON.parse(body) as T);
            } catch (err) {
              reject(err);
            }
          });
          res.on("error", reject);
        },
      )
      .on("error", reject);
  });
}

/**
 * Normaliza texto: minúsculas, sin acentos. Espejo de la función `norm()`
 * de la app mobile — mantenemos la misma lógica para que las búsquedas
 * devuelvan los mismos resultados.
 */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function fetchAllProducts(): Promise<CatalogProduct[]> {
  const token = await getAccessToken();
  const all: SpecPartsProduct[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const path = `/part/list?lang=1&limit=100&page=${page}&brand[]=GRIFFO&output=v1`;
    const data = await specpartsGet<SpecPartsListResponse>(path, token);
    if (data?.data) {
      all.push(...data.data);
      totalPages = data.paging?.pages ?? 1;
    } else {
      break;
    }
    page += 1;
  }

  // NO calculamos _searchText server-side: se hace en el cliente para
  // bajar el payload del response inicial.
  return all;
}

const REDIS_CACHE_KEY = "specparts:products-cache";
const REDIS_CACHE_TTL_SEC = 30 * 60;

/**
 * Cache secundario en Redis (Upstash) para supervivir los cold starts
 * de Vercel — el cache en memoria se pierde cada vez que la función
 * se recicla. Redis mantiene los ~370 productos por 30 min, y cada
 * nueva instancia puede levantarlos en una sola request.
 */
async function tryLoadFromRedis(): Promise<CatalogProduct[] | null> {
  const { getRedis } = await import("@/lib/kv");
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<CatalogProduct[] | string>(REDIS_CACHE_KEY);
    if (!raw) return null;
    // Upstash puede devolver el JSON ya parseado o un string.
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as CatalogProduct[];
      } catch {
        return null;
      }
    }
    return raw as CatalogProduct[];
  } catch {
    return null;
  }
}

async function trySaveToRedis(products: CatalogProduct[]): Promise<void> {
  const { getRedis } = await import("@/lib/kv");
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(REDIS_CACHE_KEY, JSON.stringify(products), {
      ex: REDIS_CACHE_TTL_SEC,
    });
  } catch {
    // Fallos de Redis son no-críticos — el cache en memoria sigue.
  }
}

/**
 * Devuelve los ~370 productos GRIFFO. Cache en 3 niveles:
 *   1. Memoria del proceso (30 min) — más rápido, se pierde en cold start.
 *   2. Redis (30 min) — sobrevive cold starts, shared entre instancias.
 *   3. Fetch a SpecParts — la fuente real.
 * Deduplica requests concurrentes con `inflightProducts`.
 */
/**
 * Lista todo el catálogo GRIFFO. 4 niveles de caché:
 *   1. Memoria del proceso (30 min) — más rápido.
 *   2. Redis (30 min) — sobrevive cold starts, shared entre instancias.
 *   3. Fetch a SpecParts — la fuente real.
 *   4. Último backup en Vercel Blob — **fallback de último recurso** si
 *      SpecParts se cae. Se lee del hash `catalog-backup:snapshots` y se
 *      baja el JSON del snapshot más reciente. Se salta si
 *      `opts.skipFallback === true` (lo usa el cron para no enmascarar
 *      fallas del proveedor con data vieja).
 * Deduplica requests concurrentes con `inflightProducts`.
 */
export async function listCatalog(
  opts: { skipFallback?: boolean } = {},
): Promise<CatalogProduct[]> {
  if (productsCache && Date.now() < productsCache.expiresAt) {
    return productsCache.products;
  }
  if (inflightProducts) return inflightProducts;

  inflightProducts = (async () => {
    // Nivel 2: intentar Redis antes de pegarle a SpecParts.
    const fromRedis = await tryLoadFromRedis();
    if (fromRedis && fromRedis.length > 0) {
      productsCache = { products: fromRedis, expiresAt: Date.now() + CACHE_TTL_MS };
      return fromRedis;
    }
    // Nivel 3: fetch real.
    try {
      const products = await fetchAllProducts();
      productsCache = { products, expiresAt: Date.now() + CACHE_TTL_MS };
      // Save en Redis (no bloqueante para el caller).
      trySaveToRedis(products).catch(() => {});
      return products;
    } catch (err) {
      const { logAdminError } = await import("@/lib/admin-log");
      await logAdminError("specparts", err);

      if (opts.skipFallback) throw err;

      // Nivel 4: último backup conocido. Mejor servir data de hace 1-2
      // días que un 500. El admin ve el error en el log igual.
      const fallback = await tryLoadFromBackup().catch(() => null);
      if (fallback && fallback.length > 0) {
        // No cacheamos en memoria — queremos que el próximo request reintente
        // el fetch real. Sólo devolvemos esto para la respuesta actual.
        return fallback;
      }
      throw err;
    }
  })().finally(() => {
    inflightProducts = null;
  });

  return inflightProducts;
}

/**
 * Baja el JSON del último snapshot desde Vercel Blob. Devuelve null si
 * no hay snapshots o si algo falla bajándolo. Import dinámico para no
 * meter el cliente de Blob + ExcelJS en el bundle cuando no hay fallback.
 */
async function tryLoadFromBackup(): Promise<CatalogProduct[] | null> {
  const { readLatestSnapshot } = await import("@/lib/catalog-backup");
  const snap = await readLatestSnapshot();
  if (!snap) return null;
  const res = await fetch(snap.jsonUrl, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as CatalogProduct[];
  return Array.isArray(data) ? data : null;
}

export async function getProductBySlug(slug: string): Promise<CatalogProduct | null> {
  const products = await listCatalog();
  return products.find((p) => p.slug === slug) ?? null;
}

/** Busca un producto por código SKU (case-insensitive, sin espacios). */
export async function getProductByCode(code: string): Promise<CatalogProduct | null> {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
  const products = await listCatalog();
  return (
    products.find(
      (p) => p.code.toUpperCase().replace(/\s+/g, "") === normalized
    ) ?? null
  );
}

export async function identifyPlate(plate: string): Promise<SpecPartsPlateResponse> {
  const token = await getAccessToken();
  const path = `/vehicle/identification?plate=${encodeURIComponent(plate)}`;
  return specpartsGet<SpecPartsPlateResponse>(path, token);
}
