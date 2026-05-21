/**
 * Cache client-side de precios del ERP con batching automático.
 *
 * Múltiples ProductPrice que montan al mismo tiempo (ej. la grilla del
 * catálogo con ~20 cards) acumulan sus códigos durante 30 ms y los mandan
 * en un solo POST /api/b2b/prices, evitando N requests paralelos.
 *
 * Si el endpoint devuelve 401 (sin sesión) o falla, el componente cae
 * silenciosamente al precio mock.
 */

const cache = new Map<string, number>();
const pending = new Map<string, Array<(price: number | null) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;
/** Si el endpoint devolvió 401, no volvemos a intentar en esta sesión. */
let noSession = false;

async function flush() {
  timer = null;
  if (!pending.size || noSession) {
    pending.clear();
    return;
  }

  const snapshot = new Map(pending);
  pending.clear();
  const codes = [...snapshot.keys()];

  try {
    const res = await fetch("/api/b2b/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes }),
      credentials: "same-origin",
    });

    if (res.status === 401) {
      noSession = true;
      for (const cbs of snapshot.values()) cbs.forEach((cb) => cb(null));
      return;
    }

    const data: Record<string, number> = res.ok ? await res.json() : {};

    for (const [code, cbs] of snapshot) {
      const price = typeof data[code] === "number" ? data[code] : null;
      if (price !== null) cache.set(code, price);
      cbs.forEach((cb) => cb(price));
    }
  } catch {
    for (const cbs of snapshot.values()) cbs.forEach((cb) => cb(null));
  }
}

/** Precio ya en cache (sin red). */
export function getCachedErpPrice(code: string): number | undefined {
  return cache.get(code);
}

/** Encola el código; invoca `cb` con el precio cuando llegue (o null si falló). */
export function enqueueErpPrice(
  code: string,
  cb: (price: number | null) => void,
): void {
  if (noSession) { cb(null); return; }
  if (!pending.has(code)) pending.set(code, []);
  pending.get(code)!.push(cb);
  if (!timer) timer = setTimeout(flush, 30);
}
