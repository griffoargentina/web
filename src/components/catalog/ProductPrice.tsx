"use client";

import { useEffect, useState } from "react";
import { useB2BPreferences } from "@/lib/b2b-preferences";
import { formatARSNeto, getMockCompraPrice } from "@/lib/mock-prices";
import { enqueueErpPrice, getCachedErpPrice } from "@/lib/erp-price-cache";

/**
 * Muestra el precio de un producto aplicando las preferencias del usuario
 * (modo compra vs PVP + margen). Siempre agrega "+ IVA".
 *
 * Prioridad:
 *   1. `compraPrice` prop (explícito desde el padre)
 *   2. Precio real del ERP (fetched via /api/b2b/prices, batched)
 *   3. Precio mock determinístico como fallback
 */
export function ProductPrice({
  productCode,
  compraPrice,
  size = "md",
}: {
  productCode: string;
  compraPrice?: number;
  size?: "sm" | "md" | "lg";
}) {
  const { prefs, ready } = useB2BPreferences();

  // Precio ERP: se inicializa con lo que ya esté en cache (para evitar flash)
  // y se actualiza cuando llega la respuesta del batch.
  const [erpPrice, setErpPrice] = useState<number | null>(() =>
    typeof window !== "undefined" ? (getCachedErpPrice(productCode) ?? null) : null,
  );

  useEffect(() => {
    // Si el padre ya pasó un precio explícito, no hace falta pedir al ERP.
    if (compraPrice !== undefined) return;

    const cached = getCachedErpPrice(productCode);
    if (cached !== undefined) {
      setErpPrice(cached);
      return;
    }

    enqueueErpPrice(productCode, (price) => {
      setErpPrice(price);
    });
  }, [productCode, compraPrice]);

  const base = compraPrice ?? erpPrice ?? getMockCompraPrice(productCode);
  const value =
    prefs.priceMode === "pvp" && ready
      ? base * (1 + prefs.marginPct / 100)
      : base;

  const priceClass =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-lg";
  const labelClass =
    size === "lg" ? "text-[11px]" : size === "sm" ? "text-[9px]" : "text-[10px]";

  const label =
    prefs.priceMode === "pvp" && ready ? "PVP sugerido" : "Precio de compra";

  return (
    <div className="flex flex-col">
      <span className={`${labelClass} font-bold uppercase tracking-wider text-gray-500`}>
        {label}
      </span>
      <span className={`${priceClass} font-black text-[#0a2b3d] leading-none`}>
        {formatARSNeto(value)}
      </span>
    </div>
  );
}
