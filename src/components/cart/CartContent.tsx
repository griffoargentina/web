"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { useMockSession } from "@/lib/mock-session";
import { useB2BPreferences } from "@/lib/b2b-preferences";
import { formatARS, formatARSNeto, getMockCompraPrice } from "@/lib/mock-prices";
import type { BejermanClient } from "@/types/bejerman";

interface Props {
  /** Cliente resuelto server-side cuando el admin está impersonando. Si
   *  no hay impersonación, viene null y se usa la sesión mock. */
  impersonatedClient: BejermanClient | null;
}

export function CartContent({ impersonatedClient }: Props) {
  const router = useRouter();
  const { items, ready, setQuantity, removeItem, clear, count } = useCart();
  const { isLoggedIn, session } = useMockSession();
  const { prefs, ready: prefsReady } = useB2BPreferences();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Cliente + sucursales del cliente. Prioridad:
       1. Si admin impersona → cliente del ERP (impersonatedClient).
       2. Si hay sesión B2B → datos guardados en login (incluye warehouses).
       3. Sin sesión → null. El usuario puede ver el carrito pero no
          confirmar (sale CTA "Ingresá para confirmar"). */
  const effectiveClient = impersonatedClient
    ? {
        clientId: impersonatedClient.client_id,
        clientName: impersonatedClient.name,
        clientEmail: impersonatedClient.email,
        warehouses: impersonatedClient.warehouses ?? [],
      }
    : session && session.clientId
      ? {
          clientId: session.clientId,
          clientName: session.clientName ?? "",
          clientEmail: session.email,
          warehouses: session.warehouses ?? [],
        }
      : null;
  const warehouses = effectiveClient?.warehouses ?? [];
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    warehouses[0]?.warehouse_id ?? "",
  );

  if (!ready) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500 text-sm">
        Cargando…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 text-gray-400 mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
        </div>
        <h2 className="text-lg font-black text-[#0a2b3d]">
          Tu carrito está vacío
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Entrá al catálogo y agregá productos para armar tu pedido.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link
            href="/catalogo"
            className="inline-block px-5 py-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg transition"
          >
            Ir al catálogo
          </Link>
          {/* Botón "Acceso clientes": temporalmente oculto (portal B2B pendiente).
              Para reactivar: descomentar el bloque. */}
          {/* {!isLoggedIn && (
            <Link
              href="/cuenta/login"
              className="inline-block px-5 py-2 border-2 border-primary text-primary hover:bg-primary hover:text-white font-bold rounded-lg transition"
            >
              Acceso clientes
            </Link>
          )} */}
        </div>
      </div>
    );
  }

  async function handleConfirmarPedido() {
    if (!effectiveClient) {
      setError("Necesitás ingresar al portal para confirmar el pedido.");
      return;
    }
    if (!selectedWarehouseId) {
      setError("Elegí una sucursal antes de confirmar.");
      return;
    }
    const selectedWarehouse = warehouses.find(
      (w) => w.warehouse_id === selectedWarehouseId,
    );
    setSubmitting(true);
    setError(null);
    try {
      const itemsPayload = items.map((it) => {
        const compra = getMockCompraPrice(it.productCode);
        return {
          productCode: it.productCode,
          slug: it.slug,
          name: it.name,
          image: it.image,
          quantity: it.quantity,
          // El ERP va a facturar con sus precios reales; en el pedido
          // guardamos el de compra neto (congelado al momento del
          // confirm) para referencia del cliente.
          unitPrice: compra,
        };
      });
      const res = await fetch("/api/b2b/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: effectiveClient.clientId,
          clientName: effectiveClient.clientName,
          clientEmail: effectiveClient.clientEmail,
          warehouseId: selectedWarehouseId,
          warehouseDescription: selectedWarehouse?.description ?? "",
          items: itemsPayload,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        pedido?: { id: string };
        error?: string;
      };
      if (!res.ok || !data.ok || !data.pedido) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      clear();
      router.push(`/cuenta/pedidos/${data.pedido.id}?nuevo=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al confirmar pedido");
      setSubmitting(false);
    }
  }

  // Precios por item según preferencias del usuario.
  const priced = items.map((it) => {
    const compra = getMockCompraPrice(it.productCode);
    const unitPrice =
      prefsReady && prefs.priceMode === "pvp"
        ? compra * (1 + prefs.marginPct / 100)
        : compra;
    return { ...it, unitPrice, subtotal: unitPrice * it.quantity };
  });
  const total = priced.reduce((a, it) => a + it.subtotal, 0);

  const priceLabel =
    prefsReady && prefs.priceMode === "pvp" ? "PVP sugerido" : "Precio de compra";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {count} {count === 1 ? "producto" : "productos"} en el carrito
        </p>
        <button
          type="button"
          onClick={clear}
          className="text-xs text-red-600 hover:underline font-semibold"
        >
          Vaciar carrito
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Cabecera de la tabla — sólo desktop. */}
        <div className="hidden md:grid md:grid-cols-[80px_1fr_140px_140px_140px_40px] gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-[10px] uppercase tracking-wider font-bold text-gray-500">
          <span></span>
          <span>Producto</span>
          <span className="text-right">{priceLabel}</span>
          <span className="text-center">Cantidad</span>
          <span className="text-right">Subtotal</span>
          <span></span>
        </div>

        <ul className="divide-y divide-gray-100">
          {priced.map((it) => (
            <li
              key={it.productCode}
              className="p-4 md:grid md:grid-cols-[80px_1fr_140px_140px_140px_40px] md:gap-4 md:items-center flex flex-wrap gap-3"
            >
              <div className="w-16 h-16 md:w-20 md:h-20 shrink-0 rounded-md bg-gray-50 border border-gray-200 overflow-hidden flex items-center justify-center">
                {it.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={it.image}
                    alt={it.name}
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <span className="text-[10px] text-gray-400">Sin imagen</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/catalogo/${it.slug}`}
                  className="font-black text-primary text-lg hover:underline"
                >
                  {it.productCode}
                </Link>
                <p className="text-xs font-bold uppercase tracking-wide text-[#0a2b3d] line-clamp-1">
                  {it.name}
                </p>
              </div>
              {/* Precio unitario */}
              <div className="md:text-right">
                <p className="md:hidden text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-0.5">
                  {priceLabel}
                </p>
                <p className="text-sm font-bold text-[#0a2b3d] whitespace-nowrap">
                  {formatARSNeto(it.unitPrice)}
                </p>
              </div>
              {/* Cantidad */}
              <div className="md:justify-self-center">
                <div className="inline-flex items-center rounded-md border border-gray-300">
                  <button
                    type="button"
                    aria-label="Disminuir"
                    onClick={() => setQuantity(it.productCode, it.quantity - 1)}
                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 font-bold text-gray-700"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={it.quantity}
                    onChange={(e) => {
                      const v = parseInt(e.target.value || "0", 10);
                      setQuantity(it.productCode, Number.isNaN(v) ? 0 : v);
                    }}
                    className="w-14 h-8 text-center text-sm font-bold outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Aumentar"
                    onClick={() => setQuantity(it.productCode, it.quantity + 1)}
                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 font-bold text-gray-700"
                  >
                    +
                  </button>
                </div>
              </div>
              {/* Subtotal */}
              <div className="md:text-right">
                <p className="md:hidden text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-0.5">
                  Subtotal
                </p>
                <p className="text-sm font-black text-[#0a2b3d] whitespace-nowrap">
                  {formatARSNeto(it.subtotal)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Quitar del carrito"
                onClick={() => removeItem(it.productCode)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 transition md:justify-self-end"
                title="Quitar"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>

        {/* Total */}
        <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-600">
            Total estimado
          </span>
          <div className="text-right">
            <p className="text-xl font-black text-[#0a2b3d] leading-none">
              {formatARS(total)}
              <span className="text-xs text-gray-500 font-bold ml-2">+ IVA</span>
            </p>
            <p className="text-[10px] text-gray-500 mt-1">
              {count} {count === 1 ? "unidad" : "unidades"} ·{" "}
              {priceLabel.toLowerCase()}
            </p>
          </div>
        </div>
      </div>

      {/* Selector de sucursal — sólo cuando hay cliente identificado */}
      {effectiveClient && warehouses.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">
                Sucursal de entrega
              </p>
              {warehouses.length === 1 ? (
                <p className="text-sm font-bold text-[#0a2b3d]">
                  {warehouses[0].description}
                  <span className="text-xs text-gray-500 font-normal ml-2">
                    (única sucursal disponible)
                  </span>
                </p>
              ) : (
                <p className="text-xs text-gray-600">
                  Elegí la sucursal donde querés recibir el pedido.
                </p>
              )}
            </div>
            {warehouses.length > 1 && (
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="px-4 py-2 border-2 border-gray-300 rounded-lg text-sm font-semibold bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none min-w-[240px]"
              >
                {warehouses.map((w) => (
                  <option key={w.warehouse_id} value={w.warehouse_id}>
                    {w.description}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          El total definitivo se confirma cuando Griffo procesa el pedido.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/catalogo"
            className="px-4 py-2 border-2 border-primary text-primary hover:bg-primary hover:text-white font-bold rounded-lg transition text-sm"
          >
            Seguir comprando
          </Link>
          {effectiveClient ? (
            <button
              type="button"
              onClick={handleConfirmarPedido}
              disabled={submitting || !selectedWarehouseId}
              className="px-5 py-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg transition text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Confirmando…" : "Confirmar pedido"}
            </button>
          ) : null
          /* Botón "Ingresar para confirmar": temporalmente oculto (portal B2B pendiente).
             Para reactivar reemplazar null por:
             <Link href="/cuenta/login" className="px-5 py-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg transition text-sm">
               Ingresar para confirmar
             </Link>
          */}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      <p className="text-xs text-gray-500">
        Al confirmar, el pedido queda en estado <b>Procesando</b>. Griffo lo
        carga en Bejerman y te va avisando por email cuando cambie de
        estado. Los precios son referenciales hasta que Griffo facture.
      </p>
    </div>
  );
}
