"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { CatalogProduct, SpecPartsVehicle } from "@/types/specparts";
import { getFeaturedSlug } from "@/data/featured-products";
import { getDisplayApplication } from "@/lib/catalog/display";
import { trackSelectItem } from "@/lib/analytics";

import { VehiclesModal } from "./VehiclesModal";
import { PriceOrML } from "./PriceOrML";

type ProductCardProps = {
  product: CatalogProduct;
  /** Link de Mercado Libre mapeado por código (subido por admin). */
  mlLink?: string | null;
};

export function ProductCard({ product, mlLink }: ProductCardProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  const primaryImage = product.pictures?.[0]?.image_url;

  const { ubicaciones, lados, tipoDireccion } = getDisplayApplication(product);
  const locationText = ubicaciones.join(", ");
  const sideText = lados.join(lados.length === 2 ? " y " : ", ");

  const vehicles = product.vehicles ?? [];
  const vehicleSummary = useMemo(() => buildVehicleSummary(vehicles), [vehicles]);

  const featuredSlug = getFeaturedSlug(product.code);
  const detailHref = featuredSlug
    ? `/productos/${featuredSlug}`
    : `/catalogo/${product.slug}`;

  const fireSelectEvent = () => {
    trackSelectItem({
      id: product.code,
      name: product.product,
      category: product.category,
      listName: "Catalogo",
    });
  };

  const handleCardClick = () => {
    fireSelectEvent();
    router.push(detailHref);
  };

  // Permitir navegar con teclado (Enter / Space) — accesibilidad.
  const handleKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fireSelectEvent();
      router.push(detailHref);
    }
  };

  return (
    <>
      <article
        onClick={handleCardClick}
        onKeyDown={handleKey}
        tabIndex={0}
        role="link"
        aria-label={`${product.code} — ${product.product}`}
        className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-gray-100 bg-white transition hover:border-accent hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div className="relative aspect-[3/2] w-full overflow-hidden bg-gray-50">
          {featuredSlug ? (
            <span className="absolute left-2 top-2 z-10 rounded bg-primary px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white shadow-sm">
              Destacado
            </span>
          ) : null}
          {primaryImage ? (
            <Image
              src={primaryImage}
              alt={product.description || product.product}
              fill
              sizes="(min-width: 1536px) 18vw, (min-width: 1280px) 22vw, (min-width: 1024px) 28vw, (min-width: 640px) 33vw, 50vw"
              className="object-contain p-2 transition group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
              Sin imagen
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-3">
          <div>
            <span className="text-lg font-black leading-none text-primary">{product.code}</span>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[#0a2b3d] line-clamp-2">
              {product.product}
            </p>
          </div>

          {vehicleSummary.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-[11px] leading-snug text-gray-600 line-clamp-4">
                <span className="font-semibold text-gray-500">Descripción: </span>
                {vehicleSummary.map((entry, i) => (
                  <span key={entry.brand}>
                    <strong className="font-bold text-[#0a2b3d]">{entry.brand}</strong>
                    {` (${entry.models.join(" - ")})`}
                    {i < vehicleSummary.length - 1 ? ", " : ""}
                  </span>
                ))}
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setModalOpen(true);
                }}
                className="self-start text-[11px] font-bold text-accent hover:text-primary-dark"
              >
                Ver {vehicles.length} {vehicles.length === 1 ? "vehículo" : "vehículos"} compatibles →
              </button>
            </div>
          ) : null}

          {locationText ? (
            <p className="text-[11px] text-gray-600">
              <span className="font-semibold text-gray-500">Ubicación: </span>
              <span className="font-semibold text-[#0a2b3d]">{locationText}</span>
            </p>
          ) : null}
          {sideText ? (
            <p className="text-[11px] text-gray-600">
              <span className="font-semibold text-gray-500">Lado: </span>
              <span className="font-semibold text-[#0a2b3d]">{sideText}</span>
            </p>
          ) : null}
          {tipoDireccion ? (
            <p className="text-[11px] text-gray-600">
              <span className="font-semibold text-gray-500">Tipo: </span>
              <span className="font-semibold text-[#0a2b3d]">{tipoDireccion}</span>
            </p>
          ) : null}

          <div className="mt-auto flex flex-col gap-2 pt-2">
            <PriceOrML
              productCode={product.code}
              slug={product.slug}
              productName={product.product}
              image={primaryImage}
              mlLink={mlLink}
              size="card"
            />
            <Link
              href={detailHref}
              onClick={(e) => e.stopPropagation()}
              className="self-start text-[11px] font-bold text-primary hover:text-primary-dark"
            >
              Ver detalle →
            </Link>
          </div>
        </div>
      </article>

      <VehiclesModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        productCode={product.code}
        productName={product.product}
        vehicles={vehicles}
      />
    </>
  );
}

type BrandSummary = { brand: string; models: string[] };

/**
 * Resumen compacto de vehículos: agrupa por marca y devuelve los modelos únicos.
 * Reproduce el formato del sitio anterior de Griffo para renderizar luego como
 * "FORD (KUGA - RANGER), CHEVROLET (S-10)" con la marca en negrita.
 */
function buildVehicleSummary(vehicles: SpecPartsVehicle[]): BrandSummary[] {
  if (!vehicles.length) return [];

  const byBrand = new Map<string, Set<string>>();
  for (const v of vehicles) {
    const brand = (v.brand || "").trim().toUpperCase();
    if (!brand) continue;
    const model = (v.master_model || v.model || "").trim().toUpperCase();
    if (!model) continue;
    if (!byBrand.has(brand)) byBrand.set(brand, new Set());
    byBrand.get(brand)!.add(model);
  }

  return Array.from(byBrand.entries()).map(([brand, models]) => ({
    brand,
    models: Array.from(models).sort(),
  }));
}
