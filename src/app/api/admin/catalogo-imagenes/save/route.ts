import { NextResponse } from "next/server";
import { setImageOverride, type CatalogoImagenId } from "@/lib/catalogo-imagenes-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/catalogo-imagenes/save
 *
 * Fallback idempotente: el cliente llama este endpoint después del upload
 * a Blob por si el webhook `onUploadCompleted` no se ejecutó (common en
 * deploys con protección activa en Vercel). Guarda la URL en Redis.
 *
 * Body: { id: CatalogoImagenId, url: string }
 *
 * Protegido por el proxy admin (proxy.ts whitelist no incluye esta ruta).
 */
export async function POST(request: Request) {
  try {
    const { id, url } = (await request.json()) as { id?: string; url?: string };

    if (!id || !url) {
      return NextResponse.json({ error: "Faltan id y/o url" }, { status: 400 });
    }
    if (!url.startsWith("https://")) {
      return NextResponse.json({ error: "URL inválida" }, { status: 400 });
    }

    await setImageOverride(id as CatalogoImagenId, url);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
