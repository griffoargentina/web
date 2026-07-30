import { NextResponse } from "next/server";
import { patchWarehouse } from "@/lib/pedidos";

/**
 * `POST /api/admin/pedidos/{id}/patch-warehouse`
 *
 * Corrige la sucursal de entrega de un pedido.
 * Body: `{ warehouseDescription: string }`. Protegido por el proxy admin.
 */

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let warehouseDescription = "";
  try {
    const body = (await req.json()) as { warehouseDescription?: unknown };
    if (typeof body?.warehouseDescription === "string") {
      warehouseDescription = body.warehouseDescription.trim().slice(0, 200);
    }
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  try {
    const updated = await patchWarehouse(id, warehouseDescription);
    return NextResponse.json({ ok: true, pedido: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al actualizar";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
