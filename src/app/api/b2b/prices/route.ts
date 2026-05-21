import { NextResponse } from "next/server";
import { getPrices } from "@/lib/api/bejerman";
import { getCurrentClient } from "@/lib/b2b/current-client";
import { getB2bSessionClientId } from "@/lib/b2b/session";
import { getImpersonatedCode } from "@/lib/b2b/impersonation";

export const dynamic = "force-dynamic";

/**
 * POST /api/b2b/prices
 * Body: { codes: string[] }
 * Response: { [productCode]: price } (precio de compra neto sin IVA)
 *
 * Llama a POST /ERP/prices con el clientId + primer warehouseId del
 * cliente logueado. Requiere sesión B2B válida o impersonación de admin.
 * Si el ERP falla → 502 (el cliente cae al precio mock).
 */
export async function POST(req: Request) {
  const sessionClientId = await getB2bSessionClientId();
  const impersonatedCode = await getImpersonatedCode();
  if (!sessionClientId && !impersonatedCode) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { codes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const codes = Array.isArray(body.codes)
    ? (body.codes as unknown[]).filter((c): c is string => typeof c === "string").slice(0, 500)
    : [];

  if (codes.length === 0) {
    return NextResponse.json({});
  }

  const client = await getCurrentClient();
  const warehouseId = client.warehouses?.[0]?.warehouse_id;
  if (!warehouseId) {
    return NextResponse.json({});
  }

  try {
    const items = await getPrices({
      clientId: client.client_id,
      warehouseId,
      items: codes.map((code) => ({ productCode: code, quantityRequested: 1 })),
    });

    const prices: Record<string, number> = {};
    for (const item of items) {
      // Usar discountedPrice si tiene descuento aplicado, sino price base.
      prices[item.productCode] = item.discountedPrice ?? item.price;
    }

    return NextResponse.json(prices, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("[b2b/prices] ERP error:", e);
    return NextResponse.json({ error: "Error del ERP" }, { status: 502 });
  }
}
