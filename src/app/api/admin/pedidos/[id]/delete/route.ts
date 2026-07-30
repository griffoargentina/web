import { NextResponse } from "next/server";
import { deletePedido } from "@/lib/pedidos";

/**
 * `POST /api/admin/pedidos/{id}/delete`
 *
 * Elimina permanentemente un pedido de Redis. Sin posibilidad de deshacer.
 * Protegido por el proxy admin.
 */

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    await deletePedido(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al eliminar";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
