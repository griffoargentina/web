/**
 * Resuelve "el cliente actual" para cualquier server component del
 * portal. Orden de prioridad:
 *   1. Si hay impersonación activa (cookie de admin) → ese cliente.
 *   2. Si hay sesión B2B real (cookie httpOnly + Redis) → ese cliente.
 *   3. Fallback → mockCurrentClient (modo demo).
 *
 * El paso 2 es lo que reemplaza al mock-session de localStorage como
 * fuente de verdad: el server confía en la cookie firmada (no en
 * localStorage que el cliente puede manipular).
 */

import "server-only";

import { mockCurrentClient } from "@/data/mock-b2b";
import { loadClientByCode } from "@/lib/b2b/client-loader";
import { getImpersonatedCode } from "@/lib/b2b/impersonation";
import { getB2bSessionClientId } from "@/lib/b2b/session";
import type { BejermanClient } from "@/types/bejerman";

export async function getCurrentClient(): Promise<BejermanClient> {
  const impersonatedCode = await getImpersonatedCode();
  if (impersonatedCode) {
    const client = await loadClientByCode(impersonatedCode);
    if (client) return client;
  }
  const sessionClientId = await getB2bSessionClientId();
  if (sessionClientId) {
    const client = await loadClientByCode(sessionClientId);
    if (client) return client;
  }
  return mockCurrentClient;
}

/** True cuando no hay sesión real ni impersonación — se usa el cliente mock. */
export async function isUsingMockFallback(): Promise<boolean> {
  const imp = await getImpersonatedCode();
  if (imp) return false;
  const sid = await getB2bSessionClientId();
  return !sid;
}

export async function isImpersonating(): Promise<boolean> {
  return (await getImpersonatedCode()) !== null;
}
