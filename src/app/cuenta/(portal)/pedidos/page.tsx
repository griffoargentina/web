import Link from "next/link";
import { listPedidosByClient } from "@/lib/pedidos";
import { getPendingOrdersForClient } from "@/lib/api/bejerman";
import { formatARS, formatDate } from "@/data/mock-b2b";
import { getCurrentClient } from "@/lib/b2b/current-client";
import { PedidoStatusPill } from "@/components/cuenta/PedidoStatusPill";
import { NotaPedidoPdfButton } from "@/components/cuenta/NotaPedidoPdfButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis pedidos" };

export default async function PedidosPage() {
  const client = await getCurrentClient();
  const clientId = client.client_id;

  const [localPedidos, erpOrders] = await Promise.all([
    listPedidosByClient(clientId, 200),
    getPendingOrdersForClient(clientId),
  ]);

  /* Los pedidos del ERP que ya existen en local (mismo erpOrderNumber)
     no se duplican — son el mismo pedido visto desde dos lados.
     Normalizamos los ids (NFC, colapso de espacios) por si Bejerman
     manda variantes con nbsp o espacios extra. */
  const normalizeErp = (s: string) =>
    s.normalize("NFC").replace(/\s+/g, " ").trim();
  const knownErpNumbers = new Set(
    localPedidos
      .map((p) => p.erpOrderNumber)
      .filter((x): x is string => Boolean(x))
      .map(normalizeErp),
  );
  const onlyErp = erpOrders.filter(
    (o) => !knownErpNumbers.has(normalizeErp(o.erpOrderId)),
  );

  const totalRows = localPedidos.length + onlyErp.length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-black text-[#0a2b3d]">Mis pedidos</h2>
          <p className="text-sm text-gray-600 mt-1">
            Incluye los pedidos que armaste desde la web y los cargados
            directamente en Bejerman.
          </p>
        </div>
        <Link
          href="/cuenta/armar-pedido"
          className="bg-primary hover:bg-primary-dark text-white font-bold px-5 py-2.5 rounded-lg transition"
        >
          + Armar pedido nuevo
        </Link>
      </div>

      {totalRows === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-[#0a2b3d] font-bold">No tenés pedidos todavía.</p>
          <p className="text-sm text-gray-600 mt-1 mb-5">
            Armá tu primer pedido desde el catálogo.
          </p>
          <Link
            href="/cuenta/armar-pedido"
            className="inline-block px-5 py-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg transition"
          >
            Armar pedido
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Pedido</th>
                <th className="px-4 py-3 font-semibold">Número de pedido</th>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Sucursal</th>
                <th className="px-4 py-3 font-semibold">Fecha despacho</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Origen</th>
                <th className="px-4 py-3 font-semibold text-right">Ítems</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {localPedidos.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-[#0a2b3d]">
                    {p.id}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {p.erpOrderNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {formatDate(p.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-xs">
                    {p.warehouseDescription || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {p.estimatedDispatchDate
                      ? formatDate(p.estimatedDispatchDate)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <PedidoStatusPill status={p.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-blue-50 text-blue-800 border-blue-200">
                      Web
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {p.items.reduce((a, x) => a + x.quantity, 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[#0a2b3d] whitespace-nowrap">
                    {formatARS(p.total)}{" "}
                    <span className="text-[10px] text-gray-500">+ IVA</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/cuenta/pedidos/${p.id}`}
                      className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                    >
                      Ver detalle →
                    </Link>
                  </td>
                </tr>
              ))}

              {onlyErp.map((o) => (
                <tr key={o.erpOrderId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">
                    —
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#0a2b3d] font-bold">
                    {o.erpOrderId}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {formatDate(o.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-xs">
                    {o.warehouseDescription || o.sucursal || o.deposito || o.warehouseId || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {o.estimatedDispatchDate
                      ? formatDate(o.estimatedDispatchDate)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold border bg-blue-50 text-blue-800 border-blue-200">
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-gray-100 text-gray-700 border-gray-200">
                      ERP
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {o.itemCount}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[#0a2b3d] whitespace-nowrap">
                    {formatARS(o.total)}{" "}
                    <span className="text-[10px] text-gray-500">+ IVA</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <NotaPedidoPdfButton erpOrderId={o.erpOrderId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
