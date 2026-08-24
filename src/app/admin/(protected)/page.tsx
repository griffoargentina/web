import Link from "next/link";
import { ErrorsLog } from "@/components/admin/ErrorsLog";
import { findConfigAlerts, type Alert } from "@/lib/admin-alerts";
import { getCatalogSummary } from "@/lib/admin-catalog-issues";
import { runHealthChecks, type HealthCheck } from "@/lib/admin-health";
import { readAdminErrors } from "@/lib/admin-log";
import {
  countLeads,
  listLeads,
  type Lead,
} from "@/lib/leads";
import {
  listNovedadesIncludingHidden,
  type Novedad,
} from "@/lib/novedades";
import { readOverrides } from "@/lib/descargas-store";
import { getZeroResultStats } from "@/lib/search-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Helper: devuelve el valor de un settled o un default si fue rejected. */
function settled<T>(res: PromiseSettledResult<T>, fallback: T): T {
  return res.status === "fulfilled" ? res.value : fallback;
}

export default async function AdminDashboard() {
  // Todo en paralelo con allSettled — si uno falla, el dashboard igual
  // renderiza el resto (antes un reject rompía toda la página).
  const [
    healthR,
    alertsR,
    catalogR,
    novedadesR,
    errorsR,
    cContactoR,
    cNewsletterR,
    cDescargaR,
    cGarantiaR,
    lContactoR,
    lNewsletterR,
    lDescargaR,
    lGarantiaR,
    descargasOverridesR,
    busquedasR,
  ] = await Promise.allSettled([
    runHealthChecks(),
    Promise.resolve(findConfigAlerts()),
    getCatalogSummary(),
    listNovedadesIncludingHidden(),
    readAdminErrors(20),
    countLeads("contacto"),
    countLeads("newsletter"),
    countLeads("descarga"),
    countLeads("garantia"),
    listLeads<Lead>("contacto"),
    listLeads<Lead>("newsletter"),
    listLeads<Lead>("descarga"),
    listLeads<Lead>("garantia"),
    readOverrides(),
    getZeroResultStats(50, false),
  ]);

  const health = settled<HealthCheck[]>(healthR, []);
  const alerts = settled<Alert[]>(alertsR, []);
  const catalog = settled(catalogR, null);
  const novedades = settled<Novedad[]>(novedadesR, []);
  const errors = settled(errorsR, []);
  const cContacto = settled(cContactoR, 0);
  const cNewsletter = settled(cNewsletterR, 0);
  const cDescarga = settled(cDescargaR, 0);
  const cGarantia = settled(cGarantiaR, 0);
  const lContacto = settled<Lead[]>(lContactoR, []);
  const lNewsletter = settled<Lead[]>(lNewsletterR, []);
  const lDescarga = settled<Lead[]>(lDescargaR, []);
  const lGarantia = settled<Lead[]>(lGarantiaR, []);
  const descargasOverrides = settled(descargasOverridesR, {} as Record<string, string>);
  const busquedasZero = settled(busquedasR, []);
  const busquedasZeroCount = busquedasZero.length;
  const busquedasZeroTotal = busquedasZero.reduce((sum, b) => sum + b.count, 0);
  const topBusqueda = busquedasZero[0];

  const ultimos7dTs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const last7 = {
    contacto: lContacto.filter((l) => l.ts >= ultimos7dTs).length,
    newsletter: lNewsletter.filter((l) => l.ts >= ultimos7dTs).length,
    descarga: lDescarga.filter((l) => l.ts >= ultimos7dTs).length,
    garantia: lGarantia.filter((l) => l.ts >= ultimos7dTs).length,
  };

  const novPublicadas = novedades.filter((n) => n.published && !n.hidden).length;
  const novSinPublicar = novedades.filter((n) => !n.published && !n.hidden).length;
  const novOcultas = novedades.filter((n) => n.hidden).length;
  const novLanz = novedades.filter((n) => n.published && !n.hidden && n.tipo === "lanzamiento").length;
  const novApl = novedades.filter((n) => n.published && !n.hidden && n.tipo === "aplicacion").length;

  // Descargas: contar cuántos overrides hay vs total de slots esperados.
  // Total teórico: 1 catálogo + 5*2 productos + 2 gated = 13
  const TOTAL_SLOTS = 13;
  const descargasConfiguradas = Object.keys(descargasOverrides).length;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-black text-[#0a2b3d]">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Estado general del sitio, servicios conectados y contenido.
        </p>
      </header>

      {/* HEALTH — semáforos, agrupados por sitio / B2B */}
      <section>
        <SectionTitle>Estado de servicios</SectionTitle>
        <HealthGroup
          title="Datos del sitio público"
          subtitle="Servicios que alimentan griffo.com.ar y el admin."
          checks={health.filter((h) => h.group === "sitio")}
        />
        <HealthGroup
          title="Portal B2B (clientes mayoristas)"
          subtitle="Servicios del área /cuenta/* — en modo demo hasta recibir credenciales reales del técnico."
          checks={health.filter((h) => h.group === "b2b")}
        />
      </section>

      {/* ALERTAS */}
      <section>
        <SectionTitle>
          Alertas{" "}
          {alerts.length > 0 && (
            <span className="ml-2 text-xs rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">
              {alerts.length}
            </span>
          )}
        </SectionTitle>
        <div className="mt-3 space-y-2">
          {alerts.length === 0 ? (
            <EmptyRow>No hay alertas de configuración. ✨</EmptyRow>
          ) : (
            alerts.map((a) => <AlertRow key={a.id} alert={a} />)
          )}
        </div>
      </section>

      {/* WIDGETS — LEADS + NOVEDADES + DESCARGAS + BUSQUEDAS */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card>
          <h3 className="font-bold text-sm text-[#0a2b3d] uppercase tracking-wide mb-3">
            Formularios (últimos 7 días)
          </h3>
          <ul className="space-y-1 text-sm">
            <Metric label="Descargas" current={last7.descarga} total={cDescarga} />
            <Metric label="Contacto" current={last7.contacto} total={cContacto} />
            <Metric label="Garantía" current={last7.garantia} total={cGarantia} />
            <Metric label="Newsletter" current={last7.newsletter} total={cNewsletter} />
          </ul>
          <Link
            href="/admin/leads"
            className="mt-4 inline-flex items-center gap-1 text-xs text-primary font-bold hover:gap-2 transition-all"
          >
            Ver leads <ArrowIcon />
          </Link>
        </Card>

        <Card>
          <h3 className="font-bold text-sm text-[#0a2b3d] uppercase tracking-wide mb-3">
            Novedades
          </h3>
          <ul className="space-y-1 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-gray-700">Publicadas</span>
              <span className="font-bold text-[#0a2b3d]">{novPublicadas}</span>
            </li>
            <li className="flex items-center justify-between text-xs text-gray-500 pl-3">
              <span>Lanzamientos</span>
              <span>{novLanz}</span>
            </li>
            <li className="flex items-center justify-between text-xs text-gray-500 pl-3">
              <span>Nuevas aplicaciones</span>
              <span>{novApl}</span>
            </li>
            <li className="flex items-center justify-between mt-1">
              <span className="text-gray-700">Sin publicar</span>
              <span className="font-bold text-gray-600">{novSinPublicar}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-gray-700">Ocultas</span>
              <span className="font-bold text-gray-600">{novOcultas}</span>
            </li>
          </ul>
          <Link
            href="/admin/novedades"
            className="mt-4 inline-flex items-center gap-1 text-xs text-primary font-bold hover:gap-2 transition-all"
          >
            Administrar novedades <ArrowIcon />
          </Link>
        </Card>

        <Card>
          <h3 className="font-bold text-sm text-[#0a2b3d] uppercase tracking-wide mb-3">
            Descargas
          </h3>
          <p className="text-2xl font-black text-[#0a2b3d]">
            {descargasConfiguradas}
            <span className="text-sm font-normal text-gray-400">
              {" "}
              / {TOTAL_SLOTS} slots con archivo
            </span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Subidos vía admin (Vercel Blob). Slots sin configurar caen al
            default en /public si existe.
          </p>
          <Link
            href="/admin/descargas"
            className="mt-4 inline-flex items-center gap-1 text-xs text-primary font-bold hover:gap-2 transition-all"
          >
            Administrar descargas <ArrowIcon />
          </Link>
        </Card>

        <Card>
          <h3 className="font-bold text-sm text-[#0a2b3d] uppercase tracking-wide mb-3">
            Búsquedas del catálogo
          </h3>
          <p className="text-2xl font-black text-[#0a2b3d]">
            {busquedasZeroCount}
            <span className="text-sm font-normal text-gray-400">
              {" "}
              sin resultados
            </span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {busquedasZeroTotal > 0
              ? `${busquedasZeroTotal} búsquedas en total que no encontraron nada.`
              : "Todavía no hay búsquedas registradas. Aparecen apenas la gente busque."}
          </p>
          {topBusqueda ? (
            <p className="text-xs text-amber-700 mt-2 italic">
              Top: <span className="font-mono">&quot;{topBusqueda.originalQuery}&quot;</span>{" "}
              ({topBusqueda.count}×)
            </p>
          ) : null}
          <Link
            href="/admin/busquedas"
            className="mt-4 inline-flex items-center gap-1 text-xs text-primary font-bold hover:gap-2 transition-all"
          >
            Ver búsquedas + GA4 <ArrowIcon />
          </Link>
        </Card>
      </section>

      {/* CATÁLOGO - dashboard de calidad de datos */}
      <section>
        <SectionTitle>Catálogo (SpecParts)</SectionTitle>
        {catalog === null ? (
          <EmptyRow>
            No se pudo cargar el catálogo (ver alertas y log de errores).
          </EmptyRow>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Total de productos" value={catalog.total} />
              <Stat
                label="Con foto"
                value={`${catalog.conFoto}`}
                detail={`${catalog.sinFoto} sin foto`}
                color={catalog.sinFoto > 0 ? "warn" : "ok"}
              />
              <Stat
                label="Con vehículos"
                value={`${catalog.total - catalog.sinVehiculos}`}
                detail={`${catalog.sinVehiculos} sin vehículos`}
                color={catalog.sinVehiculos > 0 ? "warn" : "ok"}
              />
              <Stat
                label="Con link MercadoLibre"
                value={`${catalog.conMercadoLibre}`}
                detail={`${catalog.sinMercadoLibre} sin link`}
                color={catalog.sinMercadoLibre > 0 ? "warn" : "ok"}
              />
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card>
                <h3 className="font-bold text-sm text-[#0a2b3d] uppercase tracking-wide mb-3">
                  Por línea
                </h3>
                <ul className="space-y-1 text-sm">
                  {Object.entries(catalog.byLinea)
                    .sort((a, b) => b[1] - a[1])
                    .map(([linea, count]) => (
                      <li key={linea} className="flex items-center justify-between">
                        <span className="text-gray-700">{linea}</span>
                        <span className="font-bold text-[#0a2b3d]">{count}</span>
                      </li>
                    ))}
                </ul>
              </Card>

              <Card>
                <h3 className="font-bold text-sm text-[#0a2b3d] uppercase tracking-wide mb-3">
                  Problemas detectados
                </h3>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center justify-between">
                    <span className="text-gray-700">Sin foto</span>
                    <span
                      className={`font-bold ${catalog.sinFoto > 0 ? "text-amber-600" : "text-gray-500"}`}
                    >
                      {catalog.sinFoto}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-gray-700">Sin vehículos</span>
                    <span
                      className={`font-bold ${catalog.sinVehiculos > 0 ? "text-amber-600" : "text-gray-500"}`}
                    >
                      {catalog.sinVehiculos}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-gray-700">Sin atributos técnicos</span>
                    <span
                      className={`font-bold ${catalog.sinAttributes > 0 ? "text-amber-600" : "text-gray-500"}`}
                    >
                      {catalog.sinAttributes}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-gray-700">Sin descripción</span>
                    <span
                      className={`font-bold ${catalog.sinDescripcion > 0 ? "text-amber-600" : "text-gray-500"}`}
                    >
                      {catalog.sinDescripcion}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-gray-700">
                      Discontinuados pero activos
                    </span>
                    <span
                      className={`font-bold ${catalog.discontinuadosPeroEnabled > 0 ? "text-red-600" : "text-gray-500"}`}
                    >
                      {catalog.discontinuadosPeroEnabled}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-gray-700">Sin link MercadoLibre</span>
                    <span
                      className={`font-bold ${catalog.sinMercadoLibre > 0 ? "text-amber-600" : "text-gray-500"}`}
                    >
                      {catalog.sinMercadoLibre}
                    </span>
                  </li>
                </ul>
              </Card>
            </div>

            {catalog.issues.length > 0 && (
              <div className="mt-4">
                <Card>
                  <h3 className="font-bold text-sm text-[#0a2b3d] uppercase tracking-wide mb-3">
                    Productos con problemas ({catalog.issues.length})
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Lista de productos <strong>activos</strong> a los que les
                    falta algún dato. Los primeros 10:
                  </p>
                  <ul className="divide-y divide-gray-100">
                    {catalog.issues.slice(0, 10).map((issue) => (
                      <li
                        key={issue.code}
                        className="py-2 flex flex-wrap items-center gap-3 text-sm"
                      >
                        <span className="font-mono font-bold text-primary w-24 shrink-0">
                          {issue.code}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-[#0a2b3d]">
                          {issue.titulo}
                        </span>
                        <ul className="flex flex-wrap gap-1">
                          {issue.problemas.map((p) => (
                            <li
                              key={p}
                              className="inline-flex text-[10px] bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-0.5 uppercase tracking-wide font-bold"
                            >
                              {p}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                  {catalog.issues.length > 10 && (
                    <p className="text-xs text-gray-500 mt-2">
                      …y {catalog.issues.length - 10} más.
                    </p>
                  )}
                </Card>
              </div>
            )}

            {catalog.sinMercadoLibre > 0 && (
              <div className="mt-4">
                <Card>
                  <h3 className="font-bold text-sm text-[#0a2b3d] uppercase tracking-wide mb-3">
                    Sin link MercadoLibre ({catalog.sinMercadoLibre})
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Productos activos sin link asignado en SpecParts. Los primeros 15:
                  </p>
                  <ul className="divide-y divide-gray-100">
                    {catalog.sinMLList.slice(0, 15).map((p) => (
                      <li
                        key={p.code}
                        className="py-2 flex items-center gap-3 text-sm"
                      >
                        <span className="font-mono font-bold text-primary w-24 shrink-0">
                          {p.code}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-[#0a2b3d]">
                          {p.titulo}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {catalog.sinMercadoLibre > 15 && (
                    <p className="text-xs text-gray-500 mt-2">
                      …y {catalog.sinMercadoLibre - 15} más.
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-3">
                    Los links se asignan en el admin de SpecParts (campo Links del producto).
                  </p>
                </Card>
              </div>
            )}

            {catalog.sinUbicacion.length > 0 && (
              <div className="mt-4">
                <Card>
                  <h3 className="font-bold text-sm text-[#0a2b3d] uppercase tracking-wide mb-3">
                    Sin ubicación cargada ({catalog.sinUbicacion.length})
                  </h3>
                  <p className="text-xs text-gray-500 mb-1">
                    Productos activos a los que les falta el atributo de posición en SpecParts:
                  </p>
                  <p className="text-xs text-gray-400 mb-3">
                    Transmisión → LADO CAJA / LADO RUEDA · Suspensión → DELANTERO / TRASERO · Dirección → IZQ / DER
                  </p>
                  <ul className="divide-y divide-gray-100">
                    {catalog.sinUbicacion.map((p) => (
                      <li
                        key={p.code}
                        className="py-2 flex items-center gap-3 text-sm"
                      >
                        <span className="font-mono font-bold text-primary w-24 shrink-0">
                          {p.code}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-[#0a2b3d]">
                          {p.titulo}
                        </span>
                        <span className="shrink-0 text-xs text-gray-400">
                          {p.linea} · <span className="text-amber-600">{p.falta}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-gray-400 mt-3">
                    Los atributos se cargan en el admin de SpecParts (campo Atributos del producto).
                  </p>
                </Card>
              </div>
            )}
          </>
        )}
      </section>

      {/* LOG DE ERRORES */}
      <section>
        <SectionTitle>
          Log de errores{" "}
          {errors.length > 0 && (
            <span className="ml-2 text-xs rounded-full bg-red-100 text-red-700 px-2 py-0.5">
              {errors.length}
            </span>
          )}
        </SectionTitle>
        <div className="mt-3">
          <ErrorsLog initialErrors={errors} />
        </div>
      </section>
    </div>
  );
}

/* ---------- sub-componentes ---------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-bold text-[#0a2b3d] uppercase tracking-wide border-l-4 border-accent pl-3 flex items-center">
      {children}
    </h2>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      {children}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-dashed border-gray-200 p-5 text-sm text-gray-500">
      {children}
    </div>
  );
}

function HealthGroup({
  title,
  subtitle,
  checks,
}: {
  title: string;
  subtitle: string;
  checks: HealthCheck[];
}) {
  if (checks.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-2">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
          {title}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {checks.map((h) => (
          <HealthTile key={h.id} check={h} />
        ))}
      </div>
    </div>
  );
}

function HealthTile({ check }: { check: HealthCheck }) {
  const cfg = {
    ok: { bg: "bg-green-50", border: "border-green-200", dot: "bg-green-500", text: "text-green-800" },
    warn: { bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500", text: "text-amber-800" },
    error: { bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500", text: "text-red-800" },
  }[check.status];
  return (
    <div
      className={`rounded-lg border ${cfg.border} ${cfg.bg} p-4 flex flex-col h-full`}
      title={check.detail}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} aria-hidden />
        <p className="text-xs font-bold uppercase tracking-wide text-gray-700">
          {check.label}
        </p>
      </div>
      <p className={`mt-1 text-sm font-semibold ${cfg.text}`}>
        {check.message}
      </p>
      <p className="mt-2 text-[11px] text-gray-500 leading-snug flex-1">
        {check.purpose}
      </p>
      {check.detail && (
        <p
          className={`mt-2 text-[11px] leading-snug ${
            check.status === "error"
              ? "text-red-700"
              : check.status === "warn"
                ? "text-amber-700"
                : "text-gray-500"
          }`}
        >
          {check.detail}
        </p>
      )}
    </div>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const cfg = {
    info: { bg: "bg-sky-50", border: "border-sky-200", badge: "bg-sky-100 text-sky-800", icon: "ℹ" },
    warn: { bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-800", icon: "⚠" },
    error: { bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-800", icon: "✕" },
  }[alert.severity];
  return (
    <div
      className={`rounded-lg border ${cfg.border} ${cfg.bg} p-4 flex flex-wrap items-start gap-3`}
    >
      <span
        className={`inline-flex items-center justify-center w-7 h-7 rounded-full ${cfg.badge} text-sm font-black shrink-0`}
      >
        {cfg.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-[#0a2b3d]">{alert.title}</p>
        <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">
          {alert.description}
        </p>
      </div>
      {alert.actionHref && (
        <Link
          href={alert.actionHref}
          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:gap-2 transition-all shrink-0"
        >
          {alert.actionLabel ?? "Resolver"}
          <ArrowIcon />
        </Link>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string | number;
  detail?: string;
  color?: "ok" | "warn";
}) {
  const dot =
    color === "warn" ? "bg-amber-500" : color === "ok" ? "bg-green-500" : null;
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 flex items-center gap-2">
        {dot && <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden />}
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-[#0a2b3d]">{value}</p>
      {detail && <p className="mt-1 text-xs text-gray-500">{detail}</p>}
    </div>
  );
}

function Metric({
  label,
  current,
  total,
}: {
  label: string;
  current: number;
  total: number;
}) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-gray-700">{label}</span>
      <span className="text-[#0a2b3d]">
        <span className="font-bold">{current}</span>
        <span className="text-gray-400 text-xs"> / {total} total</span>
      </span>
    </li>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
