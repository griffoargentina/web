import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_LEN = 32; // hex chars (16 bytes)

function secret(): string {
  return process.env.ADMIN_PASSWORD ?? "griffo-catalog-fallback-insecure";
}

function tokenForHour(hour: number): string {
  return createHmac("sha256", secret())
    .update(`griffo-catalog-plate-token:${hour}`)
    .digest("hex")
    .slice(0, TOKEN_LEN);
}

/** Genera un token válido para la hora actual. Server-only. */
export function generateCatalogToken(): string {
  const hour = Math.floor(Date.now() / 1000 / 3600);
  return tokenForHour(hour);
}

/**
 * Verifica el token. Acepta la hora actual y la anterior para tolerar
 * tokens generados justo antes del cambio de hora.
 */
export function verifyCatalogToken(token: string | null | undefined): boolean {
  if (!token || token.length !== TOKEN_LEN) return false;
  const hour = Math.floor(Date.now() / 1000 / 3600);
  for (const h of [hour, hour - 1]) {
    const expected = tokenForHour(h);
    try {
      if (timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return true;
    } catch {
      // nunca debería pasar (misma longitud), pero fail-closed
    }
  }
  return false;
}
