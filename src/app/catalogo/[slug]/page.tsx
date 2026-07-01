import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProductGallery } from "@/components/catalog/ProductGallery";
import { PriceOrML } from "@/components/catalog/PriceOrML";
import { ReportarErrorButton } from "@/components/catalog/ReportarErrorButton";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/StructuredData";
import { getFeaturedSlug } from "@/data/featured-products";
import { getProductBySlug, listCatalog } from "@/lib/api/specparts";
import { getDisplayApplication } from "@/lib/catalog/display";
import { SITE_URL } from "@/lib/site-url";
import type { SpecPartsAttribute, SpecPartsVehicle } from "@/types/specparts";

export const revalidate = 1800;
export const dynamicParams = true;

type Params = Promise<{ slug: string }>;

export async function generateStaticParams() {
  try {
    const products = await listCatalog();
    return products
      .filter((p) => !getFeaturedSlug(p.code))
      .map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug).catch(() => null);
  if (!product) return { title: "Producto" };

  const title = `${product.code} — ${product.product}`;
  const description = product.description
    ? `${product.description}. Repuesto Griffo código ${product.code}, categoría ${product.category}.`
    : `Repuesto Griffo código ${product.code}, ${product.product}, categoría ${product.category}.`;
  const image = product.pictures?.[0]?.image_url;

  return {
    title,
    description,
    alternates: { canonical: `/catalogo/${slug}` },
    openGraph: {
      title: `${title} | Griffo`,
      description,
      url: `/catalogo/${slug}`,
      ...(image ? { images: [{ url: image }] } : {}),
    },
  };
}

export default async function ProductoCatalogoPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug).catch(() => null);
  if (!product) notFound();

  const featuredSlug = getFeaturedSlug(product.code);
  if (featuredSlug) {
    redirect(`/productos/${featuredSlug}`);
  }

  const primaryImage = product.pictures?.[0]?.image_url ?? "";
  const productUrl = `${SITE_URL}/catalogo/${slug}`;

  const vehiclesByBrand = groupVehiclesByBrand(product.vehicles ?? []);
  const attributes = product.attributes ?? [];

  // Aplicación: Ubicación + Lado con las reglas de display por línea
  // (Suspensión esconde izq/der, Dirección promueve izq/der a Ubicación,
  // Transmisión en Ubicación sólo deja LADO CAJA / LADO RUEDA).
  const { ubicaciones, lados } = getDisplayApplication(product);

  // Medidas: el resto de los atributos (diámetros, largos, tipo, etc.).
  // Excluimos los que ya mostramos como Aplicación y los de 'Componentes'.
  const isAplicacion = (name: string) => {
    const n = name.toLowerCase();
    return /ubicaci|posici|eje|montaje|lado/.test(n);
  };
  const isComponente = (name: string) => name.toLowerCase().includes("component");

  const isTope =
    product.product.toLowerCase().includes("tope") &&
    !product.product.toLowerCase().includes("fuelle");

  const isDireccion = (product.category || "").toLowerCase().includes("direc");

  // Fallback para attrs que no dicen "boca menor/mayor" explícitamente en el nombre:
  // si ya existe un attr con "boca menor", un "diámetro interior" a secas es la boca mayor.
  const hasBocaMenorExplicit = attributes.some((a) =>
    a.name.toLowerCase().trim().includes("boca menor"),
  );

  const medidas = attributes
    .filter((a) => !isAplicacion(a.name) && !isComponente(a.name))
    .map((a) => ({ ...a, displayName: getAttrDisplayLabel(a.name, isTope, isDireccion, hasBocaMenorExplicit) }))
    .filter((a) => a.displayName !== null) as (SpecPartsAttribute & { displayName: string })[];

  const componenteAttr = attributes.find((a) => isComponente(a.name));

  return (
    <section className="container mx-auto max-w-6xl px-5 pt-6 pb-16">
      <ProductJsonLd
        name={`${product.code} — ${product.product}`}
        description={product.description || product.product}
        image={primaryImage}
        sku={product.code}
        url={productUrl}
      />
      <BreadcrumbJsonLd
        items={[
          { label: "Inicio", url: SITE_URL },
          { label: "Catálogo", url: `${SITE_URL}/catalogo` },
          { label: product.code, url: productUrl },
        ]}
      />

      <nav className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Link href="/catalogo" className="hover:text-primary">
          ← Volver al catálogo
        </Link>
      </nav>

      {/* ==== Bloque principal (arriba del fold) ==== */}
      <div className="grid gap-6 md:grid-cols-[2fr_3fr] md:gap-8">
        {/* Columna izq: imagen (acotada en altura para no empujar el resto) */}
        <div className="md:max-h-[440px]">
          <ProductGallery
            pictures={product.pictures ?? []}
            alt={product.description || product.product}
          />
        </div>

        {/* Columna der: info ordenada por importancia */}
        <div className="flex flex-col gap-4">
          {/* 1. Código + producto + categoría */}
          <header>
            <span className="inline-block rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent">
              {product.category}
            </span>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-3xl font-black leading-none text-primary">
                {product.code}
              </h1>
              <p className="text-base font-bold uppercase tracking-wide text-[#0a2b3d]">
                {product.product}
              </p>
            </div>
          </header>

          {/* 3. Aplicación: pills compactos */}
          {ubicaciones.length > 0 || lados.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {ubicaciones.map((v) => (
                <Pill key={`u-${v}`} label="Ubicación" value={v} />
              ))}
              {lados.length > 0 ? (
                <Pill label="Lado" value={lados.join(" · ")} />
              ) : null}
            </div>
          ) : null}

          {/* 4. Precio + CTAs arriba del fold */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
            <PriceOrML
              productCode={product.code}
              slug={product.slug}
              productName={product.product}
              image={product.pictures?.[0]?.image_url}
              size="detail"
            />
          </div>

          {/* 5. Medidas técnicas compactas */}
          {medidas.length > 0 ? (
            <section>
              <h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                Medidas
              </h2>
              <dl className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white">
                {medidas.map((a, i) => (
                  <MedidaRow key={`${a.name}-${i}`} attr={a} label={a.displayName} />
                ))}
              </dl>
            </section>
          ) : null}

          {/* 6. Componentes del kit (si aplica) */}
          {componenteAttr ? (
            <p className="text-xs text-gray-500">
              <span className="font-bold uppercase tracking-wide">{componenteAttr.name}: </span>
              <span className="font-semibold text-[#0a2b3d]">
                {componenteAttr.value} {componenteAttr.unit}
              </span>
            </p>
          ) : null}

          {/* 7. Referencias OEM */}
          {(() => {
            const oems = [
              ...(product.cross ?? []).filter((c) => c.oem === 1),
              ...(product.reference ?? []).filter((c) => c.oem === 1),
            ];
            if (!oems.length) return null;
            return (
              <section>
                <h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  Referencias OEM
                </h2>
                <div className="flex flex-wrap gap-2">
                  {oems.map((c, i) => (
                    <span
                      key={`${c.brand}-${c.code}-${i}`}
                      className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px]"
                    >
                      <span className="font-semibold uppercase text-gray-500">{c.brand}</span>
                      <span className="font-mono font-bold text-[#0a2b3d]">{c.code}</span>
                    </span>
                  ))}
                </div>
              </section>
            );
          })()}
        </div>
      </div>

      {/* 7. Vehículos compatibles — CSS columns (masonry).
            Cada marca ocupa solo el alto que necesita, sin emparejar
            con las demás. Se ordenan de mayor a menor cantidad para
            balance visual. */}
      {Object.keys(vehiclesByBrand).length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-500">
            Vehículos compatibles ({product.vehicles?.length ?? 0})
          </h2>
          <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4">
            {Object.entries(vehiclesByBrand)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([brand, vehicles]) => (
                <div
                  key={brand}
                  className="mb-3 break-inside-avoid rounded-lg border border-gray-100 bg-white p-3"
                >
                  <h3 className="text-xs font-black text-[#0a2b3d]">{brand}</h3>
                  <ul className="mt-1.5 space-y-0.5">
                    {vehicles.map((v, i) => (
                      <li key={`${v.model}-${i}`} className="text-[11px] text-gray-600">
                        <span className="font-bold text-[#0a2b3d]">
                          {v.model || v.master_model}
                        </span>
                        {v.version ? (
                          <span> — {v.version}</span>
                        ) : null}{" "}
                        <span className="text-gray-400">
                          ({v.sold_from_year}–{v.sold_until_year})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </section>
      ) : null}

      {/* Footer del detalle: reporte de error. Se ofrece al final, después
          de que el usuario vio toda la info, para captar discrepancias
          que detecten al revisar (foto/medidas/vehículos mal). */}
      <div className="mt-12 flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-4">
        <span className="text-xs text-gray-400">¿Algo no coincide?</span>
        <ReportarErrorButton
          productoCode={product.code}
          productoSlug={product.slug}
          variant="button"
        />
      </div>
    </section>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/10 bg-primary/5 px-2.5 py-1 text-xs">
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <span className="font-bold text-[#0a2b3d]">{value}</span>
    </span>
  );
}

function MedidaRow({ attr, label }: { attr: SpecPartsAttribute; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-1.5 text-xs">
      <dt className="uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-right font-bold text-[#0a2b3d]">
        {attr.value}
        {attr.unit ? ` ${attr.unit}` : ""}
      </dd>
    </div>
  );
}

/**
 * Mapea el nombre crudo del atributo de SpecParts al label de display.
 * Devuelve null si el atributo debe ocultarse.
 *
 * Regla principal (todos los fuelles — transmisión, dirección, suspensión):
 *   Nombre contiene "boca menor"  →  Diámetro Boca Menor Fuelle
 *   Nombre contiene "boca mayor"  →  Diámetro Boca Mayor Fuelle
 *   "Largo" / "Largo Fuelle"      →  Largo Fuelle
 *
 * Topes:
 *   "Diámetro Interno/Interior"   →  Diámetro Interno Tope
 *   "Largo Tope" / variantes      →  Largo Tope
 *
 * Fallback para attrs ambiguos ("Diámetro Interior" sin "boca" en el nombre):
 *   Si ya hay otro attr con "boca menor" → BOCA MAYOR (era el diámetro grande).
 *   Si no → BOCA MENOR (único diámetro disponible).
 */
function getAttrDisplayLabel(
  name: string,
  isTope: boolean,
  isDireccion = false,
  hasBocaMenorExplicit = false,
): string | null {
  const n = name.toLowerCase().trim();

  if (n.includes("pliegue")) return null;

  // El nombre ya especifica qué boca es → resolución directa, sin ambigüedad.
  if (n.includes("boca mayor")) return "DIÁMETRO BOCA MAYOR FUELLE";
  if (n.includes("boca menor")) {
    return isTope ? "DIÁMETRO INTERNO TOPE" : "DIÁMETRO BOCA MENOR FUELLE";
  }

  // Largo tope (varias formas que usa SpecParts)
  if (n === "largo de tope" || n === "largo tope" || n === "long. tope" || n === "altura libre" || n === "altura") {
    return "LARGO TOPE";
  }

  // "Diámetro interior/interno" sin "boca" en el nombre → verdaderamente ambiguo.
  if (/diámetro int[e]?rior|diámetro intern|diam\. int[e]?rior|diam\. intern|diám\. int|d\. interno/.test(n)) {
    if (isTope) return "DIÁMETRO INTERNO TOPE";
    return isDireccion || hasBocaMenorExplicit ? "DIÁMETRO BOCA MAYOR FUELLE" : "DIÁMETRO BOCA MENOR FUELLE";
  }

  // Sinónimos cortos sin "boca" en el nombre
  if (n === "diámetro menor" || n === "diam. menor") {
    return isTope ? "DIÁMETRO INTERNO TOPE" : "DIÁMETRO BOCA MENOR FUELLE";
  }
  if (n === "diámetro mayor" || n === "diam. mayor") {
    return "DIÁMETRO BOCA MAYOR FUELLE";
  }
  if (n === "largo" || n === "largo fuelle" || n === "long. fuelle") {
    return isTope ? "LARGO TOPE" : "LARGO FUELLE";
  }

  return name;
}

function groupVehiclesByBrand(vehicles: SpecPartsVehicle[]): Record<string, SpecPartsVehicle[]> {
  const out: Record<string, SpecPartsVehicle[]> = {};
  for (const v of vehicles) {
    const brand = v.brand || "Otros";
    if (!out[brand]) out[brand] = [];
    out[brand].push(v);
  }
  for (const brand of Object.keys(out)) {
    out[brand].sort((a, b) => {
      const ma = (a.master_model || a.model || "").toUpperCase();
      const mb = (b.master_model || b.model || "").toUpperCase();
      if (ma !== mb) return ma.localeCompare(mb);
      return (a.version || "").toUpperCase().localeCompare((b.version || "").toUpperCase());
    });
  }
  return out;
}
