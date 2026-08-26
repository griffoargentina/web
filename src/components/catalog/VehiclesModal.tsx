"use client";

import { useEffect } from "react";

import type { SpecPartsVehicle } from "@/types/specparts";
import { getTransmisionLado } from "@/data/transmision-lado";

type Props = {
  open: boolean;
  onClose: () => void;
  productCode: string;
  productName: string;
  vehicles: SpecPartsVehicle[];
  /** Claves "BRAND:MODELO" marcadas como nuevas aplicaciones.
   *  Si el modelo de un vehículo matchea, se muestra un badge rojo "Nuevo". */
  nuevosKeys?: string[];
};

function vehicleKey(v: SpecPartsVehicle): string {
  const brand = (v.brand || "").toUpperCase().trim();
  const modelo = (v.master_model || v.model || "").toUpperCase().trim();
  return `${brand}:${modelo}`;
}

export function VehiclesModal({
  open,
  onClose,
  productCode,
  productName,
  vehicles,
  nuevosKeys,
}: Props) {
  const nuevosSet = new Set(nuevosKeys ?? []);
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const grouped = groupVehiclesByBrand(vehicles);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vehicles-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-xl font-black leading-tight text-primary">{productCode}</p>
            <p className="text-xs font-bold uppercase tracking-wide text-[#0a2b3d]">
              {productName}
            </p>
            <p id="vehicles-modal-title" className="mt-1 text-[11px] text-gray-500">
              {vehicles.length} {vehicles.length === 1 ? "vehículo compatible" : "vehículos compatibles"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-gray-500 transition hover:bg-gray-100 hover:text-[#0a2b3d]"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ul className="flex flex-col gap-4">
            {Object.entries(grouped).map(([brand, list]) => {
              const brandHasNuevo = list.some((v) => nuevosSet.has(vehicleKey(v)));
              return (
                <li key={brand}>
                  <h3
                    className={`text-sm font-black ${
                      brandHasNuevo ? "text-red-700" : "text-[#0a2b3d]"
                    }`}
                  >
                    {brand}
                  </h3>
                  <ul className="mt-1 flex flex-col gap-0.5 pl-0">
                    {list.map((v, i) => {
                      const isNuevo = nuevosSet.has(vehicleKey(v));
                      return (
                        <li
                          key={`${brand}-${i}`}
                          className={`text-xs flex items-center gap-2 ${
                            isNuevo ? "text-red-700" : "text-gray-700"
                          }`}
                        >
                          {isNuevo && (
                            <span className="inline-flex items-center rounded bg-red-600 text-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide shrink-0">
                              Nuevo
                            </span>
                          )}
                          <span className="flex-1">
                            <span className={isNuevo ? "font-black" : "font-semibold"}>
                              {v.model || v.master_model}
                            </span>
                            {v.version ? (
                              <span className={isNuevo ? "text-red-500" : "text-gray-500"}>
                                {" "}
                                — {v.version}
                              </span>
                            ) : null}
                            {v.sold_from_year && v.sold_until_year ? (
                              <span className={isNuevo ? "text-red-400" : "text-gray-400"}>
                                {" "}
                                ({v.sold_from_year}–{v.sold_until_year})
                              </span>
                            ) : null}
                          </span>
                          <VehicleLadoBadge productCode={productCode} vehicleCode={v.code} />
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Badge de Lado Rueda / Lado Caja — solo aparece en productos de Transmisión
 *  cuando el lookup tiene datos. Para los 14 piezas AMBOS, usa el código del
 *  vehículo (CODIGO PROMOTIVE) para obtener el lado específico. */
function VehicleLadoBadge({
  productCode,
  vehicleCode,
}: {
  productCode: string;
  vehicleCode?: string;
}) {
  const lado = getTransmisionLado(productCode, vehicleCode);
  if (!lado) return null;

  if (lado === "RUEDA") {
    return (
      <span className="shrink-0 inline-flex items-center rounded bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
        Lado Rueda
      </span>
    );
  }
  if (lado === "CAJA") {
    return (
      <span className="shrink-0 inline-flex items-center rounded bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
        Lado Caja
      </span>
    );
  }
  // AMBOS
  return (
    <span className="shrink-0 inline-flex items-center rounded bg-gray-50 text-gray-500 border border-gray-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
      Caja y Rueda
    </span>
  );
}

function groupVehiclesByBrand(vehicles: SpecPartsVehicle[]): Record<string, SpecPartsVehicle[]> {
  const out: Record<string, SpecPartsVehicle[]> = {};
  for (const v of vehicles) {
    const brand = v.brand || "Otros";
    if (!out[brand]) out[brand] = [];
    out[brand].push(v);
  }
  // Ordenar marcas alfabéticamente
  const sorted: Record<string, SpecPartsVehicle[]> = {};
  for (const brand of Object.keys(out).sort((a, b) => a.localeCompare(b, "es"))) {
    // Ordenar modelos dentro de cada marca: master_model → version
    out[brand].sort((a, b) => {
      const ma = (a.master_model || a.model || "").toUpperCase();
      const mb = (b.master_model || b.model || "").toUpperCase();
      if (ma !== mb) return ma.localeCompare(mb);
      return (a.version || "").toUpperCase().localeCompare((b.version || "").toUpperCase());
    });
    sorted[brand] = out[brand];
  }
  return sorted;
}
