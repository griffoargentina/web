import { cookies } from "next/headers";
import { getRedis } from "@/lib/kv";

/**
 * Auth del admin con sesiones reales en Redis.
 *
 * Modelo primario (Redis disponible):
 *   - Cookie `griffo-admin-session`: session ID aleatorio 32 bytes hex.
 *   - Redis key `admin:session:<id>`: metadata con TTL.
 *   - Logout: borra la entry en Redis → cookie inútil.
 *
 * Fallback (Redis no disponible):
 *   - Cookie contiene un token HMAC-SHA256 firmado con ADMIN_PASSWORD.
 *   - Formato: "fallback:" + base64({exp, sig}).
 *   - No es revocable por sesión, pero sigue siendo seguro mientras
 *     ADMIN_PASSWORD se mantenga secreto.
 */

export const ADMIN_COOKIE_NAME = "griffo-admin-session";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 días
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_KEY_PREFIX = "admin:session:";

export const FALLBACK_PREFIX = "fallback:";

/**
 * Compara el password en tiempo constante. Trim() en ambos lados para
 * tolerar espacios/newlines del copy-paste.
 */
export async function verifyPasswordSafe(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected) return false;
  const { timingSafeEqual } = await import("crypto");
  const a = Buffer.from(password.trim(), "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length) {
    timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return timingSafeEqual(a, b);
}

async function signFallbackToken(exp: number): Promise<string> {
  const { createHmac } = await import("crypto");
  const password = process.env.ADMIN_PASSWORD ?? "";
  const payload = `griffo-admin-fallback:${exp}`;
  const sig = createHmac("sha256", password).update(payload).digest("hex");
  return FALLBACK_PREFIX + Buffer.from(JSON.stringify({ exp, sig })).toString("base64");
}

async function verifyFallbackTokenNode(token: string): Promise<boolean> {
  if (!token.startsWith(FALLBACK_PREFIX)) return false;
  try {
    const { createHmac, timingSafeEqual } = await import("crypto");
    const raw = token.slice(FALLBACK_PREFIX.length);
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf-8")) as {
      exp: unknown;
      sig: unknown;
    };
    if (typeof parsed.exp !== "number" || typeof parsed.sig !== "string") return false;
    if (Date.now() > parsed.exp) return false;
    const password = process.env.ADMIN_PASSWORD ?? "";
    const payload = `griffo-admin-fallback:${parsed.exp}`;
    const expected = createHmac("sha256", password).update(payload).digest();
    const sigBuf = Buffer.from(parsed.sig, "hex");
    if (sigBuf.length !== expected.length) return false;
    return timingSafeEqual(sigBuf, expected);
  } catch {
    return false;
  }
}

/**
 * Crea una nueva sesión. Si Redis está disponible: session ID en Redis.
 * Si Redis no está: token HMAC firmado en cookie (fallback).
 */
export async function createSession(meta?: {
  userAgent?: string;
  ip?: string;
}): Promise<string> {
  const redis = getRedis();
  const { randomBytes } = await import("crypto");
  const store = await cookies();

  if (redis) {
    try {
      const sessionId = randomBytes(32).toString("hex");
      await redis.set(
        SESSION_KEY_PREFIX + sessionId,
        JSON.stringify({
          createdAt: Date.now(),
          userAgent: meta?.userAgent,
          ip: meta?.ip,
        }),
        { ex: SESSION_TTL_SECONDS },
      );
      store.set(ADMIN_COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE,
      });
      return sessionId;
    } catch (e) {
      // Redis configurado pero no responde (ej. Upstash pausado) → fallback
      console.error("[admin-auth] Redis.set falló, usando sesión de fallback:", e);
    }
  }

  // Fallback: sesión firmada (Redis no disponible o no responde).
  console.warn("[admin-auth] Redis no disponible — sesión de fallback firmada");
  const exp = Date.now() + SESSION_TTL_SECONDS * 1000;
  const cookieValue = await signFallbackToken(exp);
  store.set(ADMIN_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return cookieValue;
}

/** Borra la sesión actual (Redis + cookie). No-op si no hay sesión. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const sessionId = store.get(ADMIN_COOKIE_NAME)?.value;
  if (sessionId && !sessionId.startsWith(FALLBACK_PREFIX)) {
    const redis = getRedis();
    if (redis) {
      try {
        await redis.del(SESSION_KEY_PREFIX + sessionId);
      } catch (e) {
        console.error("[admin-auth] error borrando sesión en Redis:", e);
      }
    }
  }
  store.delete(ADMIN_COOKIE_NAME);
}

/**
 * Valida que haya una sesión de admin activa.
 * Soporta tanto sesiones Redis como tokens de fallback firmados.
 */
export async function hasValidAdminSession(): Promise<boolean> {
  const store = await cookies();
  const sessionId = store.get(ADMIN_COOKIE_NAME)?.value;
  if (!sessionId) return false;

  if (sessionId.startsWith(FALLBACK_PREFIX)) {
    return verifyFallbackTokenNode(sessionId);
  }

  const redis = getRedis();
  if (!redis) return false;
  try {
    const session = await redis.get(SESSION_KEY_PREFIX + sessionId);
    return !!session;
  } catch {
    return false;
  }
}
