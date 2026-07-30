"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Pedido } from "@/types/pedido";

/**
 * Acciones disponibles sobre un pedido B2B desde el admin. Dependen del
 * estado actual:
 *
 *   procesando     → descargar Excel | marcar como cargado | cancelar
 *   en_preparacion → descargar Excel | marcar entregado
 *   entregado      → descargar Excel (histórico)
 *   cancelado      → (nada)
 *
 * La edición de sucursal es siempre visible (todos los estados).
 */
export function AdminPedidoActions({
  pedido,
}: {
  pedido: Pedido;
}) {
  const router = useRouter();

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-black text-[#0a2b3d]">Acciones</h2>

      {pedido.status !== "cancelado" && (
        <div className="flex flex-wrap gap-3">
          <a
            href={`/api/admin/pedidos/${pedido.id}/excel`}
            className="inline-flex items-center gap-2 px-4 py-2 border-2 border-primary text-primary hover:bg-primary hover:text-white font-bold rounded-lg transition text-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Descargar Excel para cargar en Bejerman
          </a>
        </div>
      )}

      {/* Edición de sucursal — siempre disponible para corrección manual */}
      <EditarSucursalForm
        pedidoId={pedido.id}
        current={pedido.warehouseDescription ?? ""}
        onDone={() => router.refresh()}
      />

      {pedido.status === "procesando" && (
        <>
          <MarcarCargadoForm
            pedidoId={pedido.id}
            onDone={() => router.refresh()}
          />
          <AdminCancelarForm
            pedidoId={pedido.id}
            onDone={() => router.refresh()}
          />
        </>
      )}

      {pedido.status === "en_preparacion" && (
        <MarcarEntregadoForm
          pedidoId={pedido.id}
          onDone={() => router.refresh()}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Editar sucursal (corrección manual)                                        */
/* -------------------------------------------------------------------------- */

function EditarSucursalForm({
  pedidoId,
  current,
  onDone,
}: {
  pedidoId: string;
  current: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pedidos/${pedidoId}/patch-warehouse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseDescription: value }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setOpen(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setValue(current); setOpen(true); }}
        className={`inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-semibold transition ${
          current
            ? "border-gray-300 text-gray-600 hover:border-gray-500"
            : "border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100"
        }`}
      >
        {current ? "✏️ Editar sucursal" : "⚠️ Agregar sucursal (falta)"}
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-gray-50 border border-gray-300 rounded-xl p-5 space-y-3"
    >
      <h3 className="font-bold text-[#0a2b3d]">Corregir sucursal de entrega</h3>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ej: Casa Central, Sucursal Norte…"
        autoFocus
        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:border-primary focus:ring-2 focus:ring-blue-100 outline-none bg-white"
      />
      {error && <p className="text-red-600 text-xs">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg text-sm transition disabled:opacity-50"
        >
          {submitting ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-100 transition"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Marcar como cargado (procesando → en_preparacion)                          */
/* -------------------------------------------------------------------------- */

export function MarcarCargadoForm({
  pedidoId,
  onDone,
}: {
  pedidoId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [erpOrderNumber, setErpOrderNumber] = useState("");
  const [estimatedDispatchDate, setEstimatedDispatchDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!erpOrderNumber.trim()) {
      setError("Ingresá el nº de nota que devuelve Bejerman");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/pedidos/${pedidoId}/marcar-cargado`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            erpOrderNumber: erpOrderNumber.trim(),
            estimatedDispatchDate: estimatedDispatchDate || undefined,
          }),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition text-sm"
      >
        ✓ Marcar como cargado (con nº de Bejerman)
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4"
    >
      <div>
        <h3 className="font-bold text-blue-900">Marcar como cargado en Bejerman</h3>
        <p className="text-xs text-blue-800 mt-1">
          Ingresá el <b>nº de pedido que te devolvió Bejerman</b> al
          cargar el pedido manualmente. Queda linkeado al pedido web y
          permite que en el futuro traigamos automáticamente la fecha
          de entrega y la factura asociada.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-blue-900 mb-1 uppercase tracking-wider">
            Número de pedido *
          </label>
          <input
            type="text"
            value={erpOrderNumber}
            onChange={(e) => setErpOrderNumber(e.target.value)}
            placeholder="Ej: PED-23900"
            required
            autoFocus
            className="w-full px-4 py-2 border-2 border-blue-400 rounded-lg text-sm font-mono focus:border-blue-600 focus:ring-2 focus:ring-blue-200 outline-none bg-white"
          />
          <p className="text-[10px] text-blue-700 mt-1">
            Obligatorio. Es el número que Bejerman asigna al pedido al
            guardarlo en el ERP.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-blue-900 mb-1 uppercase tracking-wider">
            Fecha de despacho
          </label>
          <input
            type="date"
            value={estimatedDispatchDate}
            onChange={(e) => setEstimatedDispatchDate(e.target.value)}
            className="w-full px-4 py-2 border border-blue-300 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none bg-white"
          />
          <p className="text-[10px] text-blue-700 mt-1">
            Opcional. Cuando el técnico extienda la API, se va a
            traer automáticamente desde Bejerman.
          </p>
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-700 font-semibold">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm disabled:opacity-60"
        >
          {submitting ? "Guardando…" : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={submitting}
          className="px-5 py-2 text-gray-700 font-bold text-sm hover:text-[#0a2b3d]"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Marcar como entregado (en_preparacion → entregado)                         */
/* -------------------------------------------------------------------------- */

export function MarcarEntregadoForm({
  pedidoId,
  onDone,
}: {
  pedidoId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [invoiceComp, setInvoiceComp] = useState("FC");
  const [invoiceCompLetra, setInvoiceCompLetra] = useState("A");
  const [invoicePuntoVenta, setInvoicePuntoVenta] = useState("0001");
  const [invoiceCompNro, setInvoiceCompNro] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceCompNro.trim()) {
      setError("Ingresá el nº de comprobante");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/pedidos/${pedidoId}/marcar-entregado`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceComp: invoiceComp.trim(),
            invoiceCompLetra: invoiceCompLetra.trim(),
            invoicePuntoVenta: invoicePuntoVenta.trim(),
            invoiceCompNro: invoiceCompNro.trim(),
          }),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition text-sm"
      >
        ✓ Marcar como entregado / facturado
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-4"
    >
      <div>
        <h3 className="font-bold text-emerald-900">
          Marcar como entregado
        </h3>
        <p className="text-xs text-emerald-800 mt-1">
          Ingresá los datos de la factura para que el cliente la pueda
          descargar desde su portal. Esto pasa el pedido a "Entregado" y
          le manda mail al cliente.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-semibold text-emerald-900 mb-1 uppercase tracking-wider">
            Tipo
          </label>
          <select
            value={invoiceComp}
            onChange={(e) => setInvoiceComp(e.target.value)}
            className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm bg-white"
          >
            <option value="FC">FC</option>
            <option value="ND">ND</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-emerald-900 mb-1 uppercase tracking-wider">
            Letra
          </label>
          <select
            value={invoiceCompLetra}
            onChange={(e) => setInvoiceCompLetra(e.target.value)}
            className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm bg-white"
          >
            <option>A</option>
            <option>B</option>
            <option>C</option>
            <option>E</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-emerald-900 mb-1 uppercase tracking-wider">
            Pto. venta
          </label>
          <input
            type="text"
            value={invoicePuntoVenta}
            onChange={(e) => setInvoicePuntoVenta(e.target.value)}
            placeholder="0001"
            className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm bg-white font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-emerald-900 mb-1 uppercase tracking-wider">
            Nº comprobante *
          </label>
          <input
            type="text"
            value={invoiceCompNro}
            onChange={(e) => setInvoiceCompNro(e.target.value)}
            placeholder="00017176"
            required
            className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm bg-white font-mono"
          />
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-700 font-semibold">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-sm disabled:opacity-60"
        >
          {submitting ? "Guardando…" : "Confirmar entrega"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={submitting}
          className="px-5 py-2 text-gray-700 font-bold text-sm hover:text-[#0a2b3d]"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Cancelar (desde admin)                                                     */
/* -------------------------------------------------------------------------- */

export function AdminCancelarForm({
  pedidoId,
  onDone,
}: {
  pedidoId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/pedidos/${pedidoId}/cancelar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() || undefined }),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 border-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-white font-bold rounded-lg transition text-sm"
      >
        Rechazar / cancelar pedido
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3"
    >
      <h3 className="font-bold text-red-900">Rechazar pedido</h3>
      <div>
        <label className="block text-xs font-semibold text-red-900 mb-1 uppercase tracking-wider">
          Motivo (opcional — se manda al cliente)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm bg-white"
          placeholder="Ej: Cliente con cuenta corriente vencida."
        />
      </div>
      {error && (
        <p className="text-sm text-red-700 font-semibold">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-sm disabled:opacity-60"
        >
          {submitting ? "Cancelando…" : "Sí, cancelar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={submitting}
          className="px-5 py-2 text-gray-700 font-bold text-sm hover:text-[#0a2b3d]"
        >
          Volver
        </button>
      </div>
    </form>
  );
}
