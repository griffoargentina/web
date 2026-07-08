"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { CatalogProduct, SpecPartsPlateResponse } from "@/types/specparts";
import {
  buildMeasureRows,
  buildVehicleTree,
  filterByPlateVehicle,
  indexProducts,
  searchByCode,
  searchByKeyword,
  searchByVehicle,
  type MeasureRow,
  type MeasureType,
  type SuspensionMeasureRow,
  buildSuspensionMeasureRows,
} from "@/lib/catalog/utils";
import {
  applyFilters,
  countActiveFilters,
  emptyFilters,
  hasActiveFilters,
  toggleFilter,
  type CatalogFilters,
  type FilterGroup,
} from "@/lib/catalog/filters";
import { trackSearch, trackSearchResults } from "@/lib/analytics";

import { FiltersSidebar } from "./FiltersSidebar";
import { ImageLightbox } from "./ImageLightbox";
import { MeasureVersionsModal } from "./MeasureVersionsModal";
import { ProductCard } from "./ProductCard";
import { StatusBadge, type CatalogStatus } from "./StatusBadge";
import { SugerenciaModal } from "./SugerenciaModal";

type TabKey = "palabra" | "patente" | "vehiculo" | "codigo" | "medidas";

type Props = {
  products: CatalogProduct[];
  status?: CatalogStatus;
  /** URL de la imagen 'Medidas de Tréboles'. Si no hay, el botón queda deshabilitado. */
  trebolesUrl?: string;
  /** Mapa código → link de Mercado Libre (subido por admin). */
  mlLinks?: Record<string, string>;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "palabra", label: "Palabra" },
  { key: "patente", label: "Patente" },
  { key: "vehiculo", label: "Vehículo" },
  { key: "codigo", label: "Código" },
  { key: "medidas", label: "Medidas" },
];

const STICKY_TOP = "top-[60px]";
const VALID_TABS: TabKey[] = ["palabra", "patente", "vehiculo", "codigo", "medidas"];
const VALID_MEASURES: MeasureType[] = ["direccion", "transmision", "tope"];
const FILTER_GROUPS: FilterGroup[] = [
  "linea",
  "tipo",
  "ubicacion",
  "lado",
  "marca",
  "modelo",
  "motor",
  "anio",
];

/**
 * Detecta si un texto ingresado en Palabra matchea formato de patente
 * argentina (vieja ABC123 o Mercosur AB123CD). Normaliza sacando espacios
 * y pasando a mayúsculas. Devuelve la patente normalizada o null.
 */
const PLATE_REGEX = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/;
function detectPlate(input: string): string | null {
  const cleaned = input.replace(/[\s-]/g, "").toUpperCase();
  return PLATE_REGEX.test(cleaned) ? cleaned : null;
}

/** Lee el estado inicial del catálogo desde los query params de la URL. */
function readStateFromParams(sp: URLSearchParams) {
  const tabParam = sp.get("tab");
  const tab: TabKey =
    tabParam && (VALID_TABS as string[]).includes(tabParam)
      ? (tabParam as TabKey)
      : "palabra";
  const mtParam = sp.get("mt");
  const measureType: MeasureType =
    mtParam && (VALID_MEASURES as string[]).includes(mtParam)
      ? (mtParam as MeasureType)
      : "direccion";

  const filters: CatalogFilters = {
    linea: new Set(csvFromParam(sp.get("linea"))),
    tipo: new Set(csvFromParam(sp.get("tipo"))),
    ubicacion: new Set(csvFromParam(sp.get("ubicacion"))),
    lado: new Set(csvFromParam(sp.get("lado"))),
    marca: new Set(csvFromParam(sp.get("marca"))),
    modelo: new Set(csvFromParam(sp.get("modelo"))),
    motor: new Set(csvFromParam(sp.get("motor"))),
    anio: new Set(csvFromParam(sp.get("anio"))),
  };

  return {
    tab,
    keyword: sp.get("q") ?? "",
    plate: sp.get("p") ?? "",
    code: sp.get("c") ?? "",
    brand: sp.get("b") ?? "",
    model: sp.get("m") ?? "",
    year: sp.get("y") ?? "",
    measureType,
    filters,
  };
}

function csvFromParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Construye la query string desde el estado actual. */
function buildQueryString(state: {
  tab: TabKey;
  keyword: string;
  plate: string;
  code: string;
  brand: string;
  model: string;
  year: string;
  measureType: MeasureType;
  filters: CatalogFilters;
}): string {
  const p = new URLSearchParams();
  if (state.tab !== "palabra") p.set("tab", state.tab);

  if (state.tab === "palabra" && state.keyword.trim()) p.set("q", state.keyword.trim());
  if (state.tab === "patente" && state.plate.trim()) p.set("p", state.plate.trim().toUpperCase());
  if (state.tab === "codigo" && state.code.trim()) p.set("c", state.code.trim());
  if (state.tab === "vehiculo") {
    if (state.brand) p.set("b", state.brand);
    if (state.model) p.set("m", state.model);
    if (state.year) p.set("y", state.year);
  }
  if (state.tab === "medidas" && state.measureType !== "direccion") {
    p.set("mt", state.measureType);
  }

  for (const group of FILTER_GROUPS) {
    const values = Array.from(state.filters[group]);
    if (values.length > 0) p.set(group, values.join(","));
  }

  return p.toString();
}

export function CatalogSearch({ products, status, trebolesUrl, mlLinks = {} }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Estado inicial desde la URL (al montar). Después sincronizamos en un efecto.
  const initial = useMemo(
    () => readStateFromParams(new URLSearchParams(searchParams.toString())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [tab, setTab] = useState<TabKey>(initial.tab);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [trebolesOpen, setTrebolesOpen] = useState(false);
  const [filters, setFilters] = useState<CatalogFilters>(initial.filters);
  const [sugerenciaOpen, setSugerenciaOpen] = useState(false);

  // Ref al sticky bar: se usa un ResizeObserver para exponer su altura
  // efectiva (+ top del header del sitio) como CSS variable. El thead de
  // la tabla de medidas la lee para quedar sticky justo debajo, sin
  // necesidad de un scroll interno (que generaba doble scrollbar).
  const stickyBarRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = stickyBarRef.current;
    if (!node) return;
    const update = () => {
      const height = node.getBoundingClientRect().height;
      document.documentElement.style.setProperty(
        "--catalog-header-bottom",
        `${60 + height}px`,
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--catalog-header-bottom");
    };
  }, []);

  const [keyword, setKeyword] = useState(initial.keyword);
  const [plate, setPlate] = useState(initial.plate);
  const [plateVehicle, setPlateVehicle] = useState<SpecPartsPlateResponse | null>(null);
  const [plateError, setPlateError] = useState<string | null>(null);
  const [platePending, startPlateTransition] = useTransition();
  const [brand, setBrand] = useState(initial.brand);
  const [model, setModel] = useState(initial.model);
  const [year, setYear] = useState(initial.year);
  const [code, setCode] = useState(initial.code);
  const [measureType, setMeasureType] = useState<MeasureType>(initial.measureType);

  const vehicleTree = useMemo(() => buildVehicleTree(products), [products]);

  // Índice de búsqueda (keyword) — lazy. Se construye la PRIMERA vez que
  // el usuario efectivamente busca por palabra (tab=palabra + 2+ chars).
  // Ahorra ~100-300ms en móviles para usuarios que entran a un tab distinto
  // (Patente/Vehículo/Código/Medidas). El índice se cachea una vez
  // construido — los siguientes keystrokes lo reusan.
  // Si llegamos con keyword pre-cargado desde la URL (ej: home search),
  // arrancamos con el índice ya listo para que los resultados aparezcan solos.
  const [indexReady, setIndexReady] = useState(
    () => initial.tab === "palabra" && initial.keyword.trim().length >= 2,
  );
  const indexedProducts = useMemo(
    () => (indexReady ? indexProducts(products) : null),
    [products, indexReady],
  );
  useEffect(() => {
    if (!indexReady && tab === "palabra" && keyword.trim().length >= 2) {
      setIndexReady(true);
    }
  }, [indexReady, tab, keyword]);

  const onToggleFilter = useCallback((group: FilterGroup, value: string) => {
    setFilters((f) => toggleFilter(f, group, value));
  }, []);
  const onClearFilters = useCallback(() => setFilters(emptyFilters()), []);

  const searchPlate = useCallback(
    (plateValue: string) => {
      const q = plateValue.trim().toUpperCase();
      if (!q) return;
      setPlateError(null);
      setPlateVehicle(null);
      startPlateTransition(async () => {
        try {
          const res = await fetch(`/api/catalog/plate?plate=${encodeURIComponent(q)}`);
          const data = (await res.json()) as SpecPartsPlateResponse;
          if (!res.ok || data.error || !data.brand) {
            setPlateError(data.error || "No se encontró vehículo para esa patente");
            return;
          }
          setPlateVehicle(data);
        } catch (err) {
          setPlateError(err instanceof Error ? err.message : "Error al buscar la patente");
        }
      });
    },
    [startPlateTransition],
  );

  // Al montar: si venimos con ?tab=patente&p=XXX, re-disparamos la búsqueda
  // de patente (el vehicle identificado no se persiste en URL — es server).
  const didInitPlate = useRef(false);
  useEffect(() => {
    if (didInitPlate.current) return;
    didInitPlate.current = true;
    if (initial.tab === "patente" && initial.plate.trim()) {
      searchPlate(initial.plate);
    }
  }, [initial, searchPlate]);

  /**
   * URL sync: cada vez que cambia el estado, actualizamos la URL con
   * router.replace (no agrega entrada al history). Debounce de 200ms para
   * text inputs, así no inundamos el history con una entry por keystroke.
   */
  useEffect(() => {
    const qs = buildQueryString({
      tab,
      keyword,
      plate,
      code,
      brand,
      model,
      year,
      measureType,
      filters,
    });
    const target = qs ? `${pathname}?${qs}` : pathname;
    const timer = setTimeout(() => {
      router.replace(target, { scroll: false });
    }, 200);
    return () => clearTimeout(timer);
  }, [
    tab,
    keyword,
    plate,
    code,
    brand,
    model,
    year,
    measureType,
    filters,
    pathname,
    router,
  ]);

  /* --- Base results por tab (antes de aplicar filtros del sidebar) --- */
  const tabState = useMemo(() => {
    if (tab === "palabra") {
      if (keyword.trim().length < 2) {
        return { kind: "empty" as const, message: "Escribí al menos 2 letras para buscar." };
      }
      if (!indexedProducts) {
        // Índice recién empezó a construirse (primer keystroke ≥ 2 chars).
        // En 1 frame el memo se rebuilda y esta rama deja de devolver empty.
        return { kind: "empty" as const, message: "Preparando búsqueda…" };
      }
      return { kind: "results" as const, products: searchByKeyword(indexedProducts, keyword) };
    }
    if (tab === "patente") {
      if (plateError) return { kind: "error" as const, message: plateError };
      if (!plateVehicle) {
        return { kind: "empty" as const, message: "Ingresá una patente para buscar." };
      }
      return {
        kind: "results" as const,
        products: filterByPlateVehicle(products, plateVehicle),
        plateVehicle,
      };
    }
    if (tab === "vehiculo") {
      if (!brand) {
        return { kind: "empty" as const, message: "Elegí una marca para empezar." };
      }
      return {
        kind: "results" as const,
        products: searchByVehicle(products, {
          brand,
          model: model || undefined,
          year: year ? parseInt(year, 10) : undefined,
        }),
      };
    }
    if (tab === "codigo") {
      if (code.trim().length < 2) {
        return { kind: "empty" as const, message: "Escribí al menos 2 caracteres del código." };
      }
      return { kind: "results" as const, products: searchByCode(products, code) };
    }
    return { kind: "measures" as const };
  }, [
    tab,
    products,
    indexedProducts,
    keyword,
    plateError,
    plateVehicle,
    brand,
    model,
    year,
    code,
  ]);

  const baseResults = tabState.kind === "results" ? tabState.products : [];
  const filteredResults = useMemo(
    () => applyFilters(baseResults, filters),
    [baseResults, filters],
  );

  const showSidebar = tab !== "medidas";
  const activeFilters = countActiveFilters(filters);

  // Snapshot del estado del buscador para mandar como contexto cuando el
  // usuario reporta un producto faltante (sugerencia). El admin ve qué
  // tipeó, en qué tab estaba.
  const busquedaSnapshot = (() => {
    if (tab === "palabra") return keyword.trim();
    if (tab === "patente") return plate.trim().toUpperCase();
    if (tab === "codigo") return code.trim();
    if (tab === "vehiculo") {
      return [brand, model, year].filter(Boolean).join(" ");
    }
    return "";
  })();
  const noHubo =
    tab !== "medidas" &&
    tabState.kind === "results" &&
    filteredResults.length === 0;

  // Tracking de búsquedas a GA4 + log de zero-results en Redis.
  // Debounceado para no spamear eventos en cada keystroke. Las
  // búsquedas con resultados van a GA4; las que devuelven 0 van
  // también al panel de admin. Tab "medidas" no se trackea (no
  // hay query de texto, es navegación).
  useEffect(() => {
    if (tab === "medidas") return;
    if (tabState.kind !== "results") return;
    const term = busquedaSnapshot;
    if (!term || term.length < 2) return;
    const count = filteredResults.length;
    const timer = setTimeout(() => {
      trackSearch({ term, tab });
      trackSearchResults({ term, tab, count });
      if (count === 0) {
        void fetch("/api/catalog/search-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: term, tab, resultsCount: 0 }),
        }).catch(() => {
          /* tolerante a fallos */
        });
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [tab, tabState.kind, busquedaSnapshot, filteredResults.length]);

  // Si el usuario tipea algo con forma de patente en Palabra, ofrecemos un
  // atajo al tab Patente. No es auto-switch — la decisión queda en el usuario.
  const detectedPlate = tab === "palabra" ? detectPlate(keyword) : null;
  const handleSwitchToPlate = useCallback(() => {
    if (!detectedPlate) return;
    setTab("patente");
    setPlate(detectedPlate);
    searchPlate(detectedPlate);
  }, [detectedPlate, searchPlate]);

  return (
    <>
      {/* ---------------- Sticky header con tabs + form ---------------- */}
      <div
        ref={stickyBarRef}
        className={`sticky ${STICKY_TOP} z-20 border-b border-gray-100 bg-white/95 backdrop-blur`}
      >
        <div className="relative px-4 py-2.5 lg:px-6">
          {/* Desktop: StatusBadge a la derecha, absolute, sin pisar el
              bloque centrado de tabs + input. */}
          <div className="absolute right-4 top-1/2 hidden -translate-y-1/2 items-center gap-2 lg:flex">
            {status ? <StatusBadge status={status} /> : null}
          </div>
          {/* Mobile: StatusBadge + Filtros como fila arriba de los tabs.
              Antes estaban en absolute right-4 y se pisaban con los
              labels de los tabs cuando el ancho era justo. */}
          {(status || showSidebar) && (
            <div className="mb-2 flex items-center justify-between gap-2 lg:hidden">
              <div>{status ? <StatusBadge status={status} /> : null}</div>
              {showSidebar ? (
                <button
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-[#0a2b3d] transition hover:border-primary"
                >
                  <FilterIcon /> Filtros
                  {activeFilters > 0 ? (
                    <span className="rounded-full bg-primary px-1.5 text-[10px] font-black text-white">
                      {activeFilters}
                    </span>
                  ) : null}
                </button>
              ) : null}
            </div>
          )}

          {/* Bloque centrado: tabs arriba + input abajo. max-w acota el ancho
              para que el buscador no se vea perdido en pantallas anchas. */}
          <div className="mx-auto max-w-3xl">
            <nav
              role="tablist"
              aria-label="Tipos de búsqueda"
              className="flex flex-wrap justify-center gap-1 border-b border-gray-100"
            >
              {TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.key)}
                    type="button"
                    className={[
                      "relative px-3 py-2 text-sm font-bold transition",
                      active
                        ? "text-primary after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-accent"
                        : "text-gray-400 hover:text-primary",
                    ].join(" ")}
                  >
                    {t.label}
                  </button>
                );
              })}
            </nav>

            <div className="mt-2.5">
              {tab === "palabra" ? (
                <KeywordForm
                  value={keyword}
                  onChange={setKeyword}
                  placeholder={`Buscá en ${products.length} productos: marca, modelo, código, categoría…`}
                />
              ) : null}
              {tab === "patente" ? (
                <PlateForm
                  value={plate}
                  onChange={setPlate}
                  onSubmit={() => searchPlate(plate)}
                  pending={platePending}
                />
              ) : null}
              {tab === "vehiculo" ? (
                <VehicleForm
                  tree={vehicleTree}
                  brand={brand}
                  model={model}
                  year={year}
                  onBrand={(v) => {
                    setBrand(v);
                    setModel("");
                    setYear("");
                  }}
                  onModel={(v) => {
                    setModel(v);
                    setYear("");
                  }}
                  onYear={setYear}
                />
              ) : null}
              {tab === "codigo" ? <CodeForm value={code} onChange={setCode} /> : null}
              {tab === "medidas" ? (
                <div className="flex flex-col gap-2">
                  <MeasuresSelector value={measureType} onChange={setMeasureType} />
                  <MedidaShortcuts
                    measureType={measureType}
                    trebolesUrl={trebolesUrl}
                    onOpenTreboles={() => setTrebolesOpen(true)}
                  />
                </div>
              ) : null}
            </div>

            {/* Link persistente — captura sugerencias incluso de usuarios
                que no llegaron al estado "0 resultados". Sutil, no estorba. */}
            <p className="mt-2 text-center text-[11px] text-gray-400">
              ¿Te falta un producto en el catálogo?{" "}
              <button
                type="button"
                onClick={() => setSugerenciaOpen(true)}
                className="font-bold text-accent transition hover:text-primary-dark"
              >
                Avisanos →
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* ---------------- Área de resultados ---------------- */}
      {tab === "medidas" ? (
        <div className="px-4 py-6 lg:px-6">
          {measureType === "tope" ? (
            <SuspensionMeasuresTable products={products} />
          ) : (
            <MeasuresTable
              products={products}
              type={measureType}
              trebolesUrl={trebolesUrl}
              trebolesOpen={trebolesOpen}
              onCloseTreboles={() => setTrebolesOpen(false)}
            />
          )}
        </div>
      ) : (
        <div
          className={
            showSidebar
              ? "grid gap-6 px-4 py-6 lg:grid-cols-[240px_1fr] lg:px-6"
              : "px-4 py-6 lg:px-6"
          }
        >
          {showSidebar ? (
            <FiltersSidebar
              baseProducts={baseResults}
              filters={filters}
              onToggle={onToggleFilter}
              onClear={onClearFilters}
              open={filtersOpen}
              onClose={() => setFiltersOpen(false)}
            />
          ) : null}

          <div>
            {tab === "palabra" && detectedPlate ? (
              <DetectedPlateHint plate={detectedPlate} onConfirm={handleSwitchToPlate} />
            ) : null}
            {tab === "patente" && tabState.kind === "results" && tabState.plateVehicle ? (
              <PlateVehicleHeader vehicle={tabState.plateVehicle} />
            ) : null}
            {tabState.kind === "empty" ? <EmptyState message={tabState.message} /> : null}
            {tabState.kind === "error" ? (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{tabState.message}</p>
            ) : null}
            {noHubo ? (
              <NoResultsHint onSugerir={() => setSugerenciaOpen(true)} />
            ) : null}
            {tabState.kind === "results" ? (
              <ResultsGrid
                results={filteredResults}
                total={baseResults.length}
                filtersActive={hasActiveFilters(filters)}
                onClearFilters={onClearFilters}
                mlLinks={mlLinks}
              />
            ) : null}
          </div>
        </div>
      )}

      <SugerenciaModal
        open={sugerenciaOpen}
        onClose={() => setSugerenciaOpen(false)}
        busqueda={busquedaSnapshot || undefined}
        tab={tab}
        prefillBrand={brand}
        prefillModel={model}
        prefillYear={year}
      />
    </>
  );
}

/* ========================================================================== */
/*  FORMS                                                                      */
/* ========================================================================== */

function KeywordForm({
  value,
  onChange,
  placeholder = "Escribí marca, modelo, código, categoría...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <SearchIcon />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Búsqueda libre"
        className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

function PlateForm({
  value,
  onChange,
  onSubmit,
  pending,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex gap-2"
    >
      <div className="relative flex-1">
        <PlateIcon />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ej: AC923HI"
          maxLength={10}
          aria-label="Patente"
          className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 text-sm uppercase focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-lg bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-dark disabled:opacity-60"
      >
        {pending ? "Buscando..." : "Buscar"}
      </button>
    </form>
  );
}

function VehicleForm({
  tree,
  brand,
  model,
  year,
  onBrand,
  onModel,
  onYear,
}: {
  tree: ReturnType<typeof buildVehicleTree>;
  brand: string;
  model: string;
  year: string;
  onBrand: (v: string) => void;
  onModel: (v: string) => void;
  onYear: (v: string) => void;
}) {
  const models = brand ? tree.modelsByBrand[brand] ?? [] : [];
  const years = brand && model ? tree.yearsByBrandModel[`${brand}|${model}`] ?? [] : [];

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <SelectField
        label="Marca"
        value={brand}
        onChange={onBrand}
        options={[
          { label: "Seleccioná marca", value: "" },
          ...tree.brands.map((b) => ({ label: b, value: b })),
        ]}
      />
      <SelectField
        label="Modelo"
        value={model}
        disabled={!brand}
        onChange={onModel}
        options={[
          { label: brand ? "Seleccioná modelo" : "Primero marca", value: "" },
          ...models.map((m) => ({ label: m, value: m })),
        ]}
      />
      <SelectField
        label="Año"
        value={year}
        disabled={!model}
        onChange={onYear}
        options={[
          { label: model ? "Todos los años" : "Primero modelo", value: "" },
          ...years.map((y) => ({ label: String(y), value: String(y) })),
        ]}
      />
    </div>
  );
}

function CodeForm({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <HashIcon />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ej: 076-35"
        aria-label="Código del producto"
        className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

function MeasuresSelector({
  value,
  onChange,
}: {
  value: MeasureType;
  onChange: (v: MeasureType) => void;
}) {
  const opts: { key: MeasureType; label: string }[] = [
    { key: "direccion", label: "Fuelle Dirección" },
    { key: "transmision", label: "Fuelle Transmisión" },
    { key: "tope", label: "Suspensión" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={[
              "rounded-lg border-2 px-3 py-2 text-xs font-bold transition",
              active
                ? "border-primary bg-primary/5 text-primary"
                : "border-gray-200 bg-white text-gray-500 hover:border-primary",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ========================================================================== */
/*  RESULT VIEWS                                                               */
/* ========================================================================== */

/**
 * Banner que aparece cuando una búsqueda devuelve 0 resultados, en
 * cualquier tab que no sea Medidas. Invita al usuario a reportar el
 * producto faltante — fuente directa de info para definir qué
 * fabricar próximo (admin lo ve en /admin/leads → tab Sugerencias).
 */
function NoResultsHint({ onSugerir }: { onSugerir: () => void }) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-2xl leading-none">🛠️</span>
        <div>
          <p className="text-sm font-black text-[#0a2b3d]">
            ¿No encontraste el producto que buscabas?
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Sumalo al pedido para que el equipo de Griffo lo evalúe para
            futuras producciones.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onSugerir}
        className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-primary-dark"
      >
        Sugerir un producto →
      </button>
    </div>
  );
}

function DetectedPlateHint({
  plate,
  onConfirm,
}: {
  plate: string;
  onConfirm: () => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-xl leading-none">🚗</span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Parece una patente
          </p>
          <p className="text-sm text-[#0a2b3d]">
            Detectamos el formato <span className="font-black">{plate}</span>. ¿Querés
            buscar por patente?
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onConfirm}
        className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white transition hover:bg-primary-dark"
      >
        Buscar como patente →
      </button>
    </div>
  );
}

function PlateVehicleHeader({ vehicle }: { vehicle: SpecPartsPlateResponse }) {
  return (
    <div className="mb-4 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
        Vehículo identificado
      </p>
      <p className="text-sm font-bold text-[#0a2b3d]">
        {vehicle.brand} {vehicle.master_model ?? vehicle.model}
      </p>
      {vehicle.version || vehicle.sold_from_year ? (
        <p className="text-xs text-gray-600">
          {vehicle.version ?? ""}{" "}
          {vehicle.sold_from_year ? `(${vehicle.sold_from_year})` : ""}
        </p>
      ) : null}
    </div>
  );
}

function ResultsGrid({
  results,
  total,
  filtersActive,
  onClearFilters,
  mlLinks,
}: {
  results: CatalogProduct[];
  total: number;
  filtersActive: boolean;
  onClearFilters: () => void;
  mlLinks: Record<string, string>;
}) {
  if (total === 0) {
    return <EmptyState message="No se encontraron productos." />;
  }
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-gray-200 p-6">
        <p className="text-sm text-gray-500">Ningún producto cumple todos los filtros activos.</p>
        {filtersActive ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs font-bold text-accent hover:text-primary-dark"
          >
            Limpiar filtros →
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        <span className="font-bold text-[#0a2b3d]">{results.length}</span>
        {results.length !== total ? (
          <span className="text-gray-400"> de {total}</span>
        ) : null}{" "}
        {results.length === 1 ? "producto" : "productos"}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {results.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            mlLink={mlLinks[p.code.toUpperCase()] ?? null}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
      {message}
    </p>
  );
}

/* ========================================================================== */
/*  MEASURES TABLE                                                             */
/* ========================================================================== */

type SortCol = "diamMenor" | "diamMayor" | "largo" | "code";

function MeasuresTable({
  products,
  type,
  trebolesUrl,
  trebolesOpen,
  onCloseTreboles,
}: {
  products: CatalogProduct[];
  type: MeasureType;
  trebolesUrl?: string;
  trebolesOpen: boolean;
  onCloseTreboles: () => void;
}) {
  const [sortCol, setSortCol] = useState<SortCol>("diamMenor");
  const [sortAsc, setSortAsc] = useState(true);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [versionsRow, setVersionsRow] = useState<MeasureRow | null>(null);

  const rows = useMemo(() => buildMeasureRows(products, type), [products, type]);
  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      if (sortCol === "code") {
        return sortAsc ? a.code.localeCompare(b.code) : b.code.localeCompare(a.code);
      }
      const key =
        sortCol === "diamMenor"
          ? "diamMenorNum"
          : sortCol === "diamMayor"
            ? "diamMayorNum"
            : "largoNum";
      const va = (a[key] as number | null) ?? (sortAsc ? Infinity : -Infinity);
      const vb = (b[key] as number | null) ?? (sortAsc ? Infinity : -Infinity);
      return sortAsc ? va - vb : vb - va;
    });
    return arr;
  }, [rows, sortCol, sortAsc]);

  const onSort = (col: SortCol) => {
    if (col === sortCol) setSortAsc(!sortAsc);
    else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-gray-500">
          <span className="font-bold text-[#0a2b3d]">{sorted.length}</span>{" "}
          {sorted.length === 1 ? "producto" : "productos"}
        </p>
        <div className="rounded-lg border border-gray-100 overflow-visible">
          <table className="min-w-full text-xs">
            <thead
              className="sticky z-10 bg-primary text-white shadow-sm"
              style={{ top: "var(--catalog-header-bottom, 200px)" }}
            >
              <tr>
                <Th onClick={() => onSort("diamMenor")} active={sortCol === "diamMenor"} asc={sortAsc}>
                  Diám. Menor
                </Th>
                <Th onClick={() => onSort("diamMayor")} active={sortCol === "diamMayor"} asc={sortAsc}>
                  Diám. Mayor
                </Th>
                <Th onClick={() => onSort("largo")} active={sortCol === "largo"} asc={sortAsc}>
                  Largo
                </Th>
                <Th onClick={() => onSort("code")} active={sortCol === "code"} asc={sortAsc}>
                  Código
                </Th>
                <th className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide">
                  Foto
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <MeasureRowView
                  key={`${type}-${row.code}`}
                  row={row}
                  onImageClick={(src, alt) => setLightbox({ src, alt })}
                  onVersionsClick={() => setVersionsRow(row)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {lightbox ? (
        <ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      ) : null}
      {versionsRow ? (
        <MeasureVersionsModal
          open={!!versionsRow}
          onClose={() => setVersionsRow(null)}
          baseCode={versionsRow.code}
          versions={versionsRow.versions}
        />
      ) : null}
      {trebolesOpen && trebolesUrl ? (
        <ImageLightbox
          src={trebolesUrl}
          alt="Medidas de tréboles — catálogo Griffo"
          onClose={onCloseTreboles}
        />
      ) : null}
    </>
  );
}

/**
 * Llamadores compactos dentro del sticky bar. Se muestran según el sub-tipo
 * de medidas activo:
 *   - Dirección   → solo 'Fuelle Universal de Dirección'
 *   - Transmisión → 'Fuelle Universal de Transmisión' + 'Medidas de Tréboles'
 *   - Tope        → ninguno (no hay universal de topes)
 *
 * Pills horizontales de 1 línea para que la cabecera no crezca demasiado.
 */
function MedidaShortcuts({
  measureType,
  trebolesUrl,
  onOpenTreboles,
}: {
  measureType: MeasureType;
  trebolesUrl?: string;
  onOpenTreboles: () => void;
}) {
  const showUniversal = measureType === "direccion" || measureType === "transmision";
  const showTreboles = measureType === "transmision";

  if (!showUniversal && !showTreboles) return null;

  const universalHref =
    measureType === "direccion"
      ? "/productos/fuelle-universal-de-direccion"
      : "/productos/kit-de-fuelles-universales-para-homocineticas";
  const trebolesDisabled = !trebolesUrl;

  return (
    <div className="flex flex-wrap gap-2">
      {showUniversal ? (
        <Link
          href={universalHref}
          className="inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-bold text-primary transition hover:border-accent hover:bg-accent/20"
        >
          <span className="text-[9px] uppercase tracking-widest text-accent">
            ¿No lo encontrás?
          </span>
          Fuelle Universal →
        </Link>
      ) : null}
      {showTreboles ? (
        <button
          type="button"
          onClick={onOpenTreboles}
          disabled={trebolesDisabled}
          title={trebolesDisabled ? "Imagen aún no cargada" : undefined}
          className={[
            "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11px] font-bold transition",
            trebolesDisabled
              ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
              : "border-primary/30 bg-primary/10 text-primary hover:border-primary hover:bg-primary/20",
          ].join(" ")}
        >
          <span
            className={[
              "text-[9px] uppercase tracking-widest",
              trebolesDisabled ? "text-gray-400" : "text-primary",
            ].join(" ")}
          >
            Guía visual
          </span>
          Medidas de Tréboles {trebolesDisabled ? "(próximamente)" : "⊕"}
        </button>
      ) : null}
    </div>
  );
}

function MeasureRowView({
  row,
  onImageClick,
  onVersionsClick,
}: {
  row: MeasureRow;
  onImageClick: (src: string, alt: string) => void;
  onVersionsClick: () => void;
}) {
  return (
    <tr className="group border-b border-gray-50 transition hover:bg-primary/5">
      <td className="px-3 py-2 text-[#0a2b3d]">{row.diamMenor || "—"}</td>
      <td className="px-3 py-2 text-[#0a2b3d]">{row.diamMayor || "—"}</td>
      <td className="px-3 py-2 text-[#0a2b3d]">{row.largo || "—"}</td>
      <td className="px-3 py-2">
        {row.isGrouped ? (
          <button
            type="button"
            onClick={onVersionsClick}
            className="inline-flex items-center gap-1 font-black text-primary hover:text-primary-dark"
          >
            {row.code}
            <span className="text-[10px] font-bold uppercase tracking-wide text-accent">
              · ver versiones ({row.versions.length})
            </span>
          </button>
        ) : (
          <Link
            href={`/catalogo/${row.productSlug}`}
            className="font-black text-primary hover:text-primary-dark"
          >
            {row.code}
          </Link>
        )}
      </td>
      <td className="relative px-3 py-1.5 text-right">
        {row.imageUrl ? (
          <div className="group/img relative inline-block">
            <button
              type="button"
              onClick={() => onImageClick(row.imageUrl!, row.productName || row.code)}
              aria-label={`Ampliar foto del producto ${row.code}`}
              className="inline-block overflow-hidden rounded border border-gray-200 bg-white p-1 transition hover:border-accent hover:shadow-sm cursor-zoom-in"
            >
              <Image
                src={row.imageUrl}
                alt={row.productName || row.code}
                width={72}
                height={72}
                className="h-16 w-16 object-contain"
              />
            </button>
            {/* Preview flotante al hover — desktop only. Aparece a la izquierda
                para no salirse del viewport en la columna final. */}
            <div
              className="pointer-events-none absolute right-full top-1/2 z-30 mr-2 hidden -translate-y-1/2 group-hover/img:block"
              aria-hidden
            >
              <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-2xl">
                <Image
                  src={row.imageUrl}
                  alt=""
                  width={200}
                  height={200}
                  className="h-48 w-48 object-contain"
                />
              </div>
            </div>
          </div>
        ) : (
          <span className="text-[10px] text-gray-300">—</span>
        )}
      </td>
    </tr>
  );
}

function Th({
  children,
  onClick,
  active,
  asc,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  asc: boolean;
}) {
  return (
    <th
      onClick={onClick}
      className="cursor-pointer select-none px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide"
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={active ? "opacity-100" : "opacity-40"}>{active && !asc ? "▼" : "▲"}</span>
      </span>
    </th>
  );
}

/* ========================================================================== */
/*  SHARED UI                                                                  */
/* ========================================================================== */

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50 disabled:text-gray-400"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ========================================================================== */
/*  ICONS                                                                      */
/* ========================================================================== */

function SearchIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PlateIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="6" width="20" height="12" rx="3" />
      <line x1="6" y1="12" x2="18" y2="12" />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

/* ========================================================================== */
/*  TABLA SUSPENSIÓN                                                           */
/* ========================================================================== */

type SuspSortCol =
  | "diamMenorFuelle"
  | "diamMayorFuelle"
  | "largoFuelle"
  | "diamInternoTope"
  | "largoTope"
  | "code";

function SuspensionMeasuresTable({ products }: { products: CatalogProduct[] }) {
  const [sortCol, setSortCol] = useState<SuspSortCol>("diamInternoTope");
  const [sortAsc, setSortAsc] = useState(true);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  const rows = useMemo(() => buildSuspensionMeasureRows(products), [products]);

  const sorted = useMemo(() => {
    const numKey: Partial<Record<SuspSortCol, keyof SuspensionMeasureRow>> = {
      diamMenorFuelle: "diamMenorFuelleNum",
      diamMayorFuelle: "diamMayorFuelleNum",
      largoFuelle: "largoFuelleNum",
      diamInternoTope: "diamInternoTopeNum",
      largoTope: "largoTopeNum",
    };
    return [...rows].sort((a, b) => {
      if (sortCol === "code") {
        return sortAsc ? a.code.localeCompare(b.code) : b.code.localeCompare(a.code);
      }
      const key = numKey[sortCol];
      if (!key) return 0;
      const va = (a[key] as number | null) ?? (sortAsc ? Infinity : -Infinity);
      const vb = (b[key] as number | null) ?? (sortAsc ? Infinity : -Infinity);
      return sortAsc ? va - vb : vb - va;
    });
  }, [rows, sortCol, sortAsc]);

  const onSort = (col: SuspSortCol) => {
    if (col === sortCol) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  return (
    <>
      <p className="text-xs text-gray-500 mb-3">
        <span className="font-bold text-[#0a2b3d]">{sorted.length}</span>{" "}
        {sorted.length === 1 ? "producto" : "productos"}
        <span className="ml-2 text-gray-400">
          · Kits (fuelle + tope) tienen todas las medidas completas · Topes solos muestran solo columnas de tope
        </span>
      </p>
      <div className="rounded-lg border border-gray-100 overflow-visible">
        <table className="min-w-full text-xs">
          <thead
            className="sticky z-10 bg-primary text-white shadow-sm"
            style={{ top: "var(--catalog-header-bottom, 200px)" }}
          >
            <tr>
              {/* Grupo fuelle */}
              <Th onClick={() => onSort("diamMenorFuelle")} active={sortCol === "diamMenorFuelle"} asc={sortAsc}>
                Ø Menor Fuelle
              </Th>
              <Th onClick={() => onSort("diamMayorFuelle")} active={sortCol === "diamMayorFuelle"} asc={sortAsc}>
                Ø Mayor Fuelle
              </Th>
              <Th onClick={() => onSort("largoFuelle")} active={sortCol === "largoFuelle"} asc={sortAsc}>
                Largo Fuelle
              </Th>
              {/* Divisor visual */}
              <th className="px-1 py-2 bg-primary/80 w-px" aria-hidden />
              {/* Grupo tope */}
              <Th onClick={() => onSort("diamInternoTope")} active={sortCol === "diamInternoTope"} asc={sortAsc}>
                Ø Int. Tope
              </Th>
              <Th onClick={() => onSort("largoTope")} active={sortCol === "largoTope"} asc={sortAsc}>
                Largo Tope
              </Th>
              {/* Info */}
              <Th onClick={() => onSort("code")} active={sortCol === "code"} asc={sortAsc}>
                Código
              </Th>
              <th className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide">
                Foto
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <SuspensionRowView
                key={row.code}
                row={row}
                onImageClick={(src, alt) => setLightbox({ src, alt })}
              />
            ))}
          </tbody>
        </table>
      </div>

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox.src}
            alt={lightbox.alt}
            className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

function SuspensionRowView({
  row,
  onImageClick,
}: {
  row: SuspensionMeasureRow;
  onImageClick: (src: string, alt: string) => void;
}) {
  const dash = <span className="text-gray-300">—</span>;
  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2 text-[#0a2b3d]">{row.diamMenorFuelle || dash}</td>
      <td className="px-3 py-2 text-[#0a2b3d]">{row.diamMayorFuelle || dash}</td>
      <td className="px-3 py-2 text-[#0a2b3d]">{row.largoFuelle || dash}</td>
      <td className="px-1 py-2 bg-gray-50 w-px" aria-hidden />
      <td className="px-3 py-2 text-[#0a2b3d]">{row.diamInternoTope || dash}</td>
      <td className="px-3 py-2 text-[#0a2b3d]">{row.largoTope || dash}</td>
      <td className="px-3 py-2 font-mono text-[#0a2b3d]">
        <a
          href={`/catalogo/${row.productSlug}`}
          className="hover:underline hover:text-primary"
          title={row.productName}
        >
          {row.code}
        </a>
      </td>
      <td className="px-3 py-2 text-right">
        {row.imageUrl ? (
          <button
            type="button"
            onClick={() => onImageClick(row.imageUrl!, row.productName)}
            className="inline-block"
            aria-label={`Ver foto de ${row.code}`}
          >
            <img
              src={row.imageUrl}
              alt={row.code}
              width={40}
              height={40}
              className="rounded object-contain"
              style={{ width: 40, height: 40 }}
            />
          </button>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
    </tr>
  );
}
