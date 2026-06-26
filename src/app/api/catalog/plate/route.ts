import { NextResponse } from "next/server";
import { identifyPlate } from "@/lib/api/specparts";
import { getRedis } from "@/lib/kv";

export const runtime = "nodejs";

/**
 * Formatos válidos de patente argentina:
 *   - Viejo: ABC123  (3 letras + 3 dígitos)
 *   - Mercosur: AB123CD  (2 letras + 3 dígitos + 2 letras)
 * Rechazamos cualquier otra cosa antes de tocar SpecParts.
 */
const PLATE_RE = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/;

const CACHE_PREFIX = "plate:v1:";
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 días — las patentes no cambian de vehículo seguido

const RATE_LIMIT = 5; // máx 5 req por IP por ventana
const RATE_WINDOW_SECONDS = 60;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}

async function checkRateLimit(ip: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // fail-open si no hay Redis
  const key = `ratelimit:plate:${ip}`;
  try {
    const count = (await redis.incr(key)) as number;
    if (count === 1) await redis.expire(key, RATE_WINDOW_SECONDS);
    return count <= RATE_LIMIT;
  } catch {
    return true; // fail-open
  }
}

async function getFromCache(plate: string): Promise<unknown> {
  const redis = getRedis();
  if (!redis) return undefined;
  try {
    const raw = await redis.get<string>(CACHE_PREFIX + plate);
    if (raw == null) return undefined;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return undefined;
  }
}

async function saveToCache(plate: string, data: unknown): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(CACHE_PREFIX + plate, JSON.stringify(data), {
      ex: CACHE_TTL_SECONDS,
    });
  } catch {
    /* ignorar — el cache es best-effort */
  }
}

export async function GET(request: Request) {
  const rawPlate = new URL(request.url).searchParams.get("plate");
  const plate = rawPlate?.trim().toUpperCase().replace(/\s+/g, "") ?? "";

  if (!plate) {
    return NextResponse.json({ error: "Falta patente" }, { status: 400 });
  }

  // Validar formato antes de consumir cuota de SpecParts
  if (!PLATE_RE.test(plate)) {
    return NextResponse.json(
      { error: "Formato de patente inválido" },
      { status: 400 },
    );
  }

  // Rate limit por IP — protege contra bots que generan patentes válidas
  const ip = clientIp(request);
  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Demasiadas consultas. Esperá un momento." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // Caché Redis: misma patente no vuelve a pegar SpecParts
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
    // Guardamos el resultado (incluso null = patente no encontrada)
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
