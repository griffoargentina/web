import { Suspense } from "react";
import type { Metadata } from "next";

import { CatalogSearch } from "@/components/catalog/CatalogSearch";
import type { CatalogStatus } from "@/components/catalog/StatusBadge";
import { listCatalog } from "@/lib/api/specparts";
import { stripProductsForClient } from "@/lib/catalog/utils";
import { resolveImageUrl } from "@/lib/catalogo-imagenes-store";
import { readLinksMap } from "@/lib/mercadolibre-links-store";
import type { CatalogProduct } from "@/types/specparts";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Catálogo",
  description:
    "Buscador de productos Griffo: fuelles, topes de amortiguador y repuestos. Buscá por patente, vehículo, código, palabra o medidas.",
  alternates: { canonical: "/catalogo" },
  openGraph: {
    title: "Catálogo — Griffo",
    description: "Buscá productos Griffo por patente, vehículo, código, palabra o medidas.",
    url: "/catalogo",
  },
};

// Esperamos al menos este número de productos para considerar el catálogo
// "sano". Menos indica que la API devolvió parcial o hay algo raro.
const HEALTHY_MIN_PRODUCTS = 300;

export default async function CatalogoPage() {
  let products: CatalogProduct[] = [];
  let loadError: string | null = null;
  try {
    products = await listCatalog();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Error al cargar el catálogo";
  }

  const status: CatalogStatus = {
    level: loadError
      ? "down"
      : products.length >= HEALTHY_MIN_PRODUCTS
        ? "ok"
        : products.length > 0
          ? "slow"
          : "down",
    productCount: products.length,
    checkedAt: new Date().toISOString(),
  };

  if (loadError) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          <p className="font-bold">No pudimos cargar el catálogo en este momento.</p>
          <p className="mt-1 text-xs">
            Probá de nuevo en unos minutos. Si el problema persiste, contactanos en{" "}
            <a href="/contacto" className="underline">
              /contacto
            </a>
            .
          </p>
        </div>
      </section>
    );
  }

  const trebolesUrl = await resolveImageUrl("medidas-treboles").catch(() => undefined);
  const mlLinks = await readLinksMap().catch(() => ({}));

  // Aligerar el payload al browser — sacamos ~6 campos que nunca se usan
  // en UI ni en búsqueda. Reduce ~10-15% el JSON serializado en el HTML.
  const clientProducts = stripProductsForClient(products);

  return (
    <Suspense>
      <CatalogSearch
        products={clientProducts}
        status={status}
        trebolesUrl={trebolesUrl}
        mlLinks={mlLinks}
      />
    </Suspense>
  );
}
