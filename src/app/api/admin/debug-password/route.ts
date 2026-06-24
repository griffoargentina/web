import { NextResponse } from "next/server";
import { getRedis } from "@/lib/kv";

export const runtime = "nodejs";

// Endpoint de diagnóstico — muestra estado sin exponer valores secretos.
export async function GET() {
  const raw = process.env.ADMIN_PASSWORD;
  const trimmed = raw?.trim();

  const redisUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  let redisStatus: "ok" | "error" | "not_configured" = "not_configured";
  let redisError: string | null = null;

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set("admin:debug:ping", "1", { ex: 5 });
      redisStatus = "ok";
    } catch (e) {
      redisStatus = "error";
      redisError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    password: {
      isSet: !!raw,
      rawLength: raw?.length ?? 0,
      trimmedLength: trimmed?.length ?? 0,
      firstChar: trimmed ? trimmed[0] : null,
      lastChar: trimmed ? trimmed[trimmed.length - 1] : null,
    },
    redis: {
      urlSet: !!redisUrl,
      tokenSet: !!redisToken,
      status: redisStatus,
      error: redisError,
    },
  });
}
