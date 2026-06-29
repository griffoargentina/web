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

// v2: invalida resultados cacheados con la clave anterior (v1 cacheó respuestas vacías)
const CACHE_PREFIX = "plate:v2:";
const CACHE_TTL_HIT = 60 * 60 * 24 * 7; // 7 días si encontró el vehículo
const CACHE_TTL_MISS = 60 * 60;          // 1 hora si la patente no está en SpecParts

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
  const redis = getRedis();
  if (!redis) return;
  // Solo cacheamos si SpecParts respondió algo (con o sin vehículo).
  // TTL largo si encontró el vehículo; corto si no lo encontró (evita
  // que un resultado vacío por throttling quede pegado 7 días).
  const ttl = data.brand ? CACHE_TTL_HIT : CACHE_TTL_MISS;
  try {
    await redis.set(CACHE_PREFIX + plate, JSON.stringify(data), { ex: ttl });
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
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
