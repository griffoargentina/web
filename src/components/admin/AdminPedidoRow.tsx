"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Pedido } from "@/types/pedido";
import { PedidoStatusPill } from "@/components/cuenta/PedidoStatusPill";
import {
  AdminCancelarForm,
  EliminarPedidoButton,
  MarcarCargadoForm,
  MarcarEntregadoForm,
} from "@/components/admin/AdminPedidoActions";

/**
 * Fila expandible para la lista de pedidos del admin. Al expandir
 * muestra los ítems + todas las acciones disponibles para el estado
 * actual (descargar Excel, marcar cargado/entregado, cancelar).
 *
 * El resumen del detalle vive igual en `/admin/pedidos/{id}` por si el
 * operador quiere ver todo más grande, pero con esta fila es suficiente
 * para la operación del día a día.
 */
export function AdminPedidoRow({ pedido }: { pedido: Pedido }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const totalItems = pedido.items.reduce((a, x) => a + x.quantity, 0);

  function handleAction() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <tr
        className={`${
          open ? "bg-blue-50" : "hover:bg-gray-50"
        } cursor-pointer transition`}
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-4 py-3 whitespace-nowrap">
          <button
            type="button"
            aria-label={open ? "Contraer" : "Expandir"}
            className="text-gray-400 hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${open ? "rotate-90" : ""}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </td>
        <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
          {pedido.id}
        </td>
        <td className="px-4 py-3">
          <p className="font-semibold text-[#0a2b3d]">{pedido.clientName}</p>
          <p className="text-xs text-gray-500 font-mono">{pedido.clientId}</p>
        </td>
        <td className="px-4 py-3 text-xs text-gray-700">
          {pedido.warehouseDescription || (
            <span className="text-amber-600 font-semibold">⚠ sin sucursal</span>
          )}
        </td>
        <td className="px-4 py-3 text-gray-700 whitespace-nowrap text-xs">
          {formatDateTime(pedido.createdAt)}
        </td>
        <td className="px-4 py-3">
          <PedidoStatusPill status={pedido.status} />
        </td>
        <td className="px-4 py-3 font-mono text-xs text-gray-600">
          {pedido.erpOrderNumber ?? "—"}
        </td>
        <td className="px-4 py-3 text-right text-gray-700">{totalItems}</td>
        <td className="px-4 py-3 text-right font-semibold text-[#0a2b3d] whitespace-nowrap">
          {formatARS(pedido.total)}
        </td>
      </tr>

      {open && (
        <tr className="bg-blue-50/40">
          <td colSpan={9} className="px-4 py-5 border-b-2 border-primary/20">
            <div className="space-y-4">
              {/* Header con acciones rápidas */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider font-bold text-gray-500">
                    Acciones rápidas
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {pedido.status === "procesando" &&
                      "Bajate el Excel, cargá el pedido en Bejerman y pegá el nº acá."}
                    {pedido.status === "en_preparacion" &&
                      "Cuando se emita la factura, cargá los datos acá para cerrar el pedido."}
                    {pedido.status === "entregado" &&
                      "Pedido facturado. Podés re-descargar el Excel si lo necesitás."}
                    {pedido.status === "cancelado" &&
                      "Pedido cancelado. Sólo queda disponible el Excel como referencia."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/api/admin/pedidos/${pedido.id}/excel`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border-2 border-primary text-primary hover:bg-primary hover:text-white font-bold rounded-lg transition text-xs"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Descargar Excel
                  </a>
                  <Link
                    href={`/admin/pedidos/${pedido.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-primary hover:underline font-bold text-xs"
                  >
                    Abrir detalle completo →
                  </Link>
                </div>
              </div>

              {/* Ítems resumidos */}
              <div
                className="bg-white border border-gray-200 rounded-lg overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Código</th>
                      <th className="px-3 py-2 font-semibold">Producto</th>
                      <th className="px-3 py-2 font-semibold text-right">Cant.</th>
                      <th className="px-3 py-2 font-semibold text-right">Unitario</th>
                      <th className="px-3 py-2 font-semibold text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pedido.items.map((it) => (
                      <tr key={it.productCode}>
                        <td className="px-3 py-2 font-mono text-primary font-bold">
                          {it.productCode}
                        </td>
                        <td className="px-3 py-2 text-[#0a2b3d]">{it.name}</td>
                        <td className="px-3 py-2 text-right">{it.quantity}</td>
                        <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                          {formatARS(it.unitPrice)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-[#0a2b3d] whitespace-nowrap">
                          {formatARS(it.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Forms de acción según estado */}
              <div
                className="space-y-3"
                onClick={(e) => e.stopPropagation()}
              >
                {pedido.status === "procesando" && (
                  <>
                    <MarcarCargadoForm
                      pedidoId={pedido.id}
                      onDone={handleAction}
                    />
                    <AdminCancelarForm
                      pedidoId={pedido.id}
                      onDone={handleAction}
                    />
                  </>
                )}
                {pedido.status === "en_preparacion" && (
                  <MarcarEntregadoForm
                    pedidoId={pedido.id}
                    onDone={handleAction}
                  />
                )}
                <div className="pt-2 border-t border-gray-200">
                  <EliminarPedidoButton
                    pedidoId={pedido.id}
                    onDone={handleAction}
                  />
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function formatARS(value: number): string {
  return value.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
