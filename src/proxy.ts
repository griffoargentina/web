import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy (antes "middleware") — Next.js 16 renombró el file convention
 * de `middleware.ts` a `proxy.ts`. Comportamiento idéntico.
 *
 * Guard de /admin/* y /api/admin/*.
 *
 * Soporta dos tipos de cookie:
 *  1. Session ID hex (Redis-backed): validado contra Redis.
 *  2. Token HMAC firmado (fallback cuando Redis no está): empieza
 *     con "fallback:", verificado con ADMIN_PASSWORD via Web Crypto.
 *
 * Corre en Edge Runtime — se usa @upstash/redis (HTTP REST) y
 * crypto.subtle (Web Crypto API) en vez de módulos de Node.
 */

const COOKIE_NAME = "griffo-admin-session";
const SESSION_KEY_PREFIX = "admin:session:";
const FALLBACK_PREFIX = "fallback:";

/**
 * Rutas exentas del guard.
 *
 * - /admin/login y /api/admin/login: la pantalla y endpoint de login.
 * - /api/admin/descargas/upload: recibe webhooks firmados desde Vercel
 *   Blob sin cookie. handleUpload verifica la signature internamente.
 */
const EXEMPT_PATHS = [
  "/admin/login",
  "/api/admin/login",
  "/api/admin/descargas/upload",
  "/api/admin/banners/upload",
  "/api/admin/debug-password",
];

function isExempt(pathname: string): boolean {
  return EXEMPT_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

async function verifyFallbackTokenEdge(
  token: string,
  password: string,
): Promise<boolean> {
  if (!token.startsWith(FALLBACK_PREFIX)) return false;
  try {
    const raw = token.slice(FALLBACK_PREFIX.length);
    // atob disponible en Edge Runtime
    const decoded = atob(raw);
    const parsed = JSON.parse(decoded) as { exp: unknown; sig: unknown };
    if (typeof parsed.exp !== "number" || typeof parsed.sig !== "string") return false;
    if (Date.now() > parsed.exp) return false;

    const payload = `griffo-admin-fallback:${parsed.exp}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const sigBytes = new Uint8Array(
      (parsed.sig.match(/.{2}/g) ?? []).map((b: string) => parseInt(b, 16)),
    );
    return await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payload));
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Solo aplica a rutas /admin/* y /api/admin/*
  if (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin")) {
    return NextResponse.next();
  }

  if (isExempt(pathname)) {
    return NextResponse.next();
  }

  const sessionId = request.cookies.get(COOKIE_NAME)?.value;

  if (!sessionId) {
    return unauthorized(request, pathname);
  }

  // Fallback: token HMAC firmado (sin Redis)
  if (sessionId.startsWith(FALLBACK_PREFIX)) {
    const password = process.env.ADMIN_PASSWORD ?? "";
    const valid = await verifyFallbackTokenEdge(sessionId, password);
    if (!valid) return unauthorized(request, pathname);
    return NextResponse.next();
  }

  // Validar sesión en Redis
  const redisUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    // Redis no configurado → fail-open para no lockear al admin en dev
    return NextResponse.next();
  }

  try {
    const redis = new Redis({ url: redisUrl, token: redisToken });
    const session = await redis.get(SESSION_KEY_PREFIX + sessionId);
    if (!session) {
      return unauthorized(request, pathname);
    }
  } catch {
    // Redis caído → fail-open
    return NextResponse.next();
  }

  return NextResponse.next();
}

function unauthorized(request: NextRequest, pathname: string): NextResponse {
  const isApi = pathname.startsWith("/api/");
  if (isApi) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl, 307);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
