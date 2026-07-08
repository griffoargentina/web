import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_LEN = 32; // hex chars (16 bytes)

function secret(): string {
  return process.env.ADMIN_PASSWORD ?? "griffo-catalog-fallback-insecure";
}

function tokenForDay(day: number): string {
  return createHmac("sha256", secret())
    .update(`griffo-catalog-plate-token:${day}`)
    .digest("hex")
    .slice(0, TOKEN_LEN);
}

/** Genera un token válido para el día UTC actual. Server-only. */
export function generateCatalogToken(): string {
  const day = Math.floor(Date.now() / 1000 / 86400);
  return tokenForDay(day);
}

/**
 * Verifica el token. Acepta el día UTC actual y el anterior para tolerar
 * páginas cacheadas por ISR (hasta 30 min) que crucen la medianoche.
 */
export function verifyCatalogToken(token: string | null | undefined): boolean {
  if (!token || token.length !== TOKEN_LEN) return false;
  const day = Math.floor(Date.now() / 1000 / 86400);
  for (const d of [day, day - 1]) {
    const expected = tokenForDay(d);
    try {
      if (timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return true;
    } catch {
      // nunca debería pasar (misma longitud), pero fail-closed
    }
  }
  return false;
}
