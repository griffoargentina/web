import { NextResponse } from "next/server";
import { identifyPlate } from "@/lib/api/specparts";
import { getRedis } from "@/lib/kv";
import type { SpecPartsPlateResponse } from "@/types/specparts";

export const runtime = "nodejs";

/**
 * Formatos válidos de patente argentina:
 *   - Viejo: ABC123  (3 letras + 3 dígitos)
 *   - Mercosur: AB123CD  (2 letras + 3 dígitos + 2 letras)
 * Rechazamos cualquier otra cosa antes de tocar SpecParts.
 */
const PLATE_RE = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/;

// v3: invalida v2 que pudo cachear resultados vacíos durante throttling
const CACHE_PREFIX = "plate:v3:";
const CACHE_TTL_HIT = 60 * 60 * 24 * 7; // 7 días — solo si encontró el vehículo

const PLATE_STATUS_KEY = "plate:last-status";
const PLATE_STATUS_TTL = 60 * 60 * 48; // 48h

async function saveLastPlateStatus(ok: boolean, throttled = false): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(
      PLATE_STATUS_KEY,
      JSON.stringify({ ok, throttled, at: Date.now() }),
      { ex: PLATE_STATUS_TTL },
    );
  } catch { /* best-effort */ }
}

const RATE_LIMIT = 10; // máx 10 req por IP por ventana (era 5, muy restrictivo)
const RATE_WINDOW_SECONDS = 60;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}

async function checkRateLimit(ip: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  const key = `ratelimit:plate:${ip}`;
  try {
    const count = (await redis.incr(key)) as number;
    if (count === 1) await redis.expire(key, RATE_WINDOW_SECONDS);
    return count <= RATE_LIMIT;
  } catch {
    return true; // fail-open
  }
}

async function getFromCache(plate: string): Promise<SpecPartsPlateResponse | undefined> {
  const redis = getRedis();
  if (!redis) return undefined;
  try {
    const raw = await redis.get<string>(CACHE_PREFIX + plate);
    if (raw == null) return undefined;
    return typeof raw === "string"
      ? (JSON.parse(raw) as SpecPartsPlateResponse)
      : (raw as SpecPartsPlateResponse);
  } catch {
    return undefined;
  }
}

async function saveToCache(plate: string, data: SpecPartsPlateResponse): Promise<void> {
  // Solo cacheamos si SpecParts encontró un vehículo real.
  // Resultados vacíos (throttling, patente inexistente) NO se cachean —
  // así el próximo intento siempre vuelve a consultar SpecParts.
  if (!data.brand) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(CACHE_PREFIX + plate, JSON.stringify(data), { ex: CACHE_TTL_HIT });
  } catch {
    /* cache best-effort */
  }
}

export async function GET(request: Request) {
  const rawPlate = new URL(request.url).searchParams.get("plate");
  const plate = rawPlate?.trim().toUpperCase().replace(/\s+/g, "") ?? "";

  if (!plate) {
    return NextResponse.json({ error: "Falta patente" }, { status: 400 });
  }

  if (!PLATE_RE.test(plate)) {
    return NextResponse.json(
      { error: "Formato de patente inválido" },
      { status: 400 },
    );
  }

  const ip = clientIp(request);
  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Demasiadas consultas. Esperá un momento." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const cached = await getFromCache(plate);
  if (cached !== undefined) {
    return NextResponse.json(cached, {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "X-Cache": "HIT",
      },
    });
  }

  try {
    const data = await identifyPlate(plate);
    await saveToCache(plate, data);
    saveLastPlateStatus(true).catch(() => {});
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    // 429 de SpecParts: cupo agotado por bots previos, no es error nuestro
    const isThrottle = message.includes("429");
    if (isThrottle) saveLastPlateStatus(false, true).catch(() => {});
    // Nunca exponer el mensaje interno al frontend — puede incluir URLs o detalles del proveedor.
    const clientError = isThrottle
      ? "Servicio temporalmente no disponible. Intentá en unos minutos."
      : "No pudimos consultar la patente. Intentá de nuevo.";
    return NextResponse.json(
      { error: clientError },
      { status: isThrottle ? 503 : 500 },
    );
  }
}
