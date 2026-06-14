/**
 * Email semanal de salud — resumen de qué pasó en el sitio los últimos
 * 7 días, listo para que la cliente sepa si todo está OK sin tener
 * que entrar al admin.
 *
 * Contenido:
 *   - Estado actual de cada servicio (semáforos en vivo).
 *   - Alertas de configuración pendientes.
 *   - Leads recibidos por tipo en los últimos 7 días.
 *   - Errores logueados en los últimos 7 días (top scopes + count).
 *   - Snapshots del catálogo generados en los últimos 7 días (deberían
 *     ser 7; menos = el cron falló esos días).
 *
 * Se manda por Resend al destinatario configurado en
 * `b2b:config.healthDigestEmail` (Redis), con fallback a la env var
 * HEALTH_DIGEST_EMAIL, con fallback a contacto@griffo.com.ar.
 *
 * Se dispara desde `/api/cron/weekly-digest` (vercel.json domingos 12 UTC
 * = 9 AR) o manualmente desde el admin (TODO si la cliente lo pide).
 */

import "server-only";

import { findConfigAlerts, type Alert } from "@/lib/admin-alerts";
import { runHealthChecks, type HealthCheck } from "@/lib/admin-health";
import { readAdminErrors, type AdminErrorEntry } from "@/lib/admin-log";
import { readSnapshots, type CatalogSnapshot } from "@/lib/catalog-backup";
import { getRedis } from "@/lib/kv";
import { listLeads, type Lead, type LeadKind } from "@/lib/leads";
import { sendEmail } from "@/lib/resend";
import { SITE_URL } from "@/lib/site-url";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RECIPIENT_KEY = "b2b:config";
const RECIPIENT_FIELD = "healthDigestEmail";
const FALLBACK_EMAIL = "contacto@griffo.com.ar";

const LEAD_KINDS: LeadKind[] = [
  "sugerencia",
  "reporte_error",
  "contacto",
  "newsletter",
  "descarga",
  "garantia",
  "desarrollo",
];

const KIND_LABELS: Record<LeadKind, string> = {
  sugerencia: "Sugerencias de productos",
  reporte_error: "Reportes de error",
  contacto: "Mensajes de contacto",
  newsletter: "Suscripciones al newsletter",
  descarga: "Pedidos de descarga (gated)",
  garantia: "Registros de garantía",
  desarrollo: "Consultas de desarrollo a medida",
};

export type DigestSummary = {
  generatedAt: string;
  health: HealthCheck[];
  alerts: Alert[];
  leadsCounts: { kind: LeadKind; label: string; count: number }[];
  errors: { scope: string; count: number; lastMessage: string }[];
  totalErrors: number;
  snapshotsLast7Days: { date: string; productCount: number }[];
  snapshotsExpected: number;
  snapshotsMissing: number;
};

/** Junta toda la data del digest. Read-only — no muta nada. */
export async function buildDigestSummary(): Promise<DigestSummary> {
  const now = Date.now();
  const since = now - ONE_WEEK_MS;

  // Run en paralelo lo que se pueda (algunos checks pegan a externos
  // y son lentos — Promise.allSettled para no caer todo si uno explota).
  const [health, alertsArr, errors, snapshots, leadsByKind] = await Promise.all([
    runHealthChecks().catch(() => []),
    Promise.resolve(findConfigAlerts()),
    readAdminErrors(100).catch(() => []),
    readSnapshots().catch(() => []),
    Promise.all(
      LEAD_KINDS.map(async (kind) => ({
        kind,
        leads: await listLeads(kind).catch(() => [] as Lead[]),
      })),
    ),
  ]);

  const leadsCounts = leadsByKind.map(({ kind, leads }) => ({
    kind,
    label: KIND_LABELS[kind],
    count: leads.filter((l) => l.ts >= since).length,
  }));

  // Errores agrupados por scope, con el último mensaje de cada uno.
  const errorsLast7 = errors.filter((e) => e.ts >= since);
  const byScope = new Map<string, { count: number; lastMessage: string }>();
  for (const e of errorsLast7) {
    const existing = byScope.get(e.scope);
    if (existing) {
      existing.count += 1;
    } else {
      byScope.set(e.scope, { count: 1, lastMessage: e.message });
    }
  }
  const errorsBucket = Array.from(byScope.entries())
    .map(([scope, v]) => ({ scope, ...v }))
    .sort((a, b) => b.count - a.count);

  // Snapshots: filtramos los últimos 7 días por fecha string YYYY-MM-DD.
  const sevenDaysAgo = new Date(since).toISOString().slice(0, 10);
  const snapshotsLast7Days = snapshots
    .filter((s) => s.date >= sevenDaysAgo)
    .map((s) => ({ date: s.date, productCount: s.productCount }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    generatedAt: new Date(now).toISOString(),
    health,
    alerts: alertsArr,
    leadsCounts,
    errors: errorsBucket.slice(0, 5),
    totalErrors: errorsLast7.length,
    snapshotsLast7Days,
    snapshotsExpected: 7,
    snapshotsMissing: Math.max(0, 7 - snapshotsLast7Days.length),
  };
}

/** Determina destinatario: Redis override > env var > fallback. */
async function resolveRecipient(): Promise<string> {
  const redis = getRedis();
  if (redis) {
    try {
      const val = await redis.hget<string>(RECIPIENT_KEY, RECIPIENT_FIELD);
      if (val && val.includes("@")) return val;
    } catch {
      // ignore
    }
  }
  if (process.env.HEALTH_DIGEST_EMAIL?.includes("@")) {
    return process.env.HEALTH_DIGEST_EMAIL;
  }
  return FALLBACK_EMAIL;
}

/** Envía el email del digest. Devuelve metadata para loggear. */
export async function sendWeeklyDigest(): Promise<{
  recipient: string;
  ok: boolean;
  errorMessage?: string;
  summary: DigestSummary;
}> {
  const summary = await buildDigestSummary();
  const recipient = await resolveRecipient();

  // Si Resend no está configurado, devolvemos summary igual — el cron
  // logueará la falla pero no truena.
  if (!process.env.RESEND_API_KEY) {
    return {
      recipient,
      ok: false,
      errorMessage: "RESEND_API_KEY no configurada",
      summary,
    };
  }

  const allHealthy = summary.health.every((h) => h.status === "ok");
  const hasErrorAlerts = summary.alerts.some((a) => a.severity === "error");
  const overall = !allHealthy || hasErrorAlerts || summary.snapshotsMissing > 0;

  const subject = overall
    ? `⚠️ Griffo web — resumen semanal con alertas`
    : `✅ Griffo web — resumen semanal (todo OK)`;

  try {
    await sendEmail({
      from: "Griffo <contacto@griffo.com.ar>",
      to: [...new Set([recipient, "jgriffo@griffo.com.ar"])],
      subject,
      html: renderHtml(summary),
    });
    return { recipient, ok: true, summary };
  } catch (e) {
    return {
      recipient,
      ok: false,
      errorMessage: e instanceof Error ? e.message : String(e),
      summary,
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  HTML del email                                                             */
/* -------------------------------------------------------------------------- */

function renderHtml(s: DigestSummary): string {
  const fmtDate = new Date(s.generatedAt).toLocaleString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return `<!doctype html>
<html lang="es">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #0a2b3d; background: #f6f8fa;">
    <div style="background: #fff; border-radius: 12px; padding: 28px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <h1 style="margin: 0 0 4px; font-size: 22px; color: #00549F;">Griffo web — resumen semanal</h1>
      <p style="margin: 0 0 20px; color: #64748b; font-size: 13px;">${fmtDate}</p>

      ${renderHealthSection(s)}
      ${renderAlertsSection(s)}
      ${renderLeadsSection(s)}
      ${renderSnapshotsSection(s)}
      ${renderErrorsSection(s)}

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="margin: 0; font-size: 12px; color: #94a3b8;">
        Este email se envía cada domingo desde el cron del sitio.
        Para ver el detalle completo entrá al
        <a href="${SITE_URL}/admin" style="color: #00549F;">admin → dashboard</a>.
      </p>
    </div>
  </body>
</html>`;
}

function renderHealthSection(s: DigestSummary): string {
  const rows = s.health
    .map(
      (h) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
          ${statusDot(h.status)} ${escape(h.label)}
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #64748b; font-size: 13px;">
          ${escape(h.message)}
        </td>
      </tr>`,
    )
    .join("");
  return `
    <h2 style="font-size: 15px; margin: 16px 0 8px; color: #0a2b3d;">Estado de servicios</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">${rows}</table>
  `;
}

function renderAlertsSection(s: DigestSummary): string {
  if (s.alerts.length === 0) {
    return `
      <h2 style="font-size: 15px; margin: 24px 0 8px;">Alertas de configuración</h2>
      <p style="margin: 0; color: #16a34a; font-size: 13px;">✓ Sin alertas — todo configurado.</p>
    `;
  }
  const items = s.alerts
    .map((a) => {
      const color =
        a.severity === "error" ? "#dc2626" : a.severity === "warn" ? "#d97706" : "#2563eb";
      return `
      <li style="margin-bottom: 10px;">
        <strong style="color: ${color};">${escape(a.title)}</strong><br/>
        <span style="font-size: 13px; color: #475569;">${escape(a.description)}</span>
      </li>`;
    })
    .join("");
  return `
    <h2 style="font-size: 15px; margin: 24px 0 8px;">Alertas de configuración (${s.alerts.length})</h2>
    <ul style="margin: 0; padding-left: 18px;">${items}</ul>
  `;
}

function renderLeadsSection(s: DigestSummary): string {
  const total = s.leadsCounts.reduce((acc, l) => acc + l.count, 0);
  const rows = s.leadsCounts
    .filter((l) => l.count > 0)
    .map(
      (l) => `
      <tr>
        <td style="padding: 6px; border-bottom: 1px solid #e5e7eb;">${escape(l.label)}</td>
        <td style="padding: 6px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">${l.count}</td>
      </tr>`,
    )
    .join("");
  if (total === 0) {
    return `
      <h2 style="font-size: 15px; margin: 24px 0 8px;">Leads de los últimos 7 días</h2>
      <p style="margin: 0; color: #94a3b8; font-size: 13px;">Sin leads esta semana.</p>
    `;
  }
  return `
    <h2 style="font-size: 15px; margin: 24px 0 8px;">Leads de los últimos 7 días (${total})</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">${rows}</table>
  `;
}

function renderSnapshotsSection(s: DigestSummary): string {
  const ok = s.snapshotsMissing === 0;
  const color = ok ? "#16a34a" : "#d97706";
  const icon = ok ? "✓" : "⚠️";
  const detail = ok
    ? `Los ${s.snapshotsExpected} snapshots diarios se generaron correctamente.`
    : `Faltan ${s.snapshotsMissing} de ${s.snapshotsExpected} snapshots esperados — el cron pudo haber fallado esos días.`;
  return `
    <h2 style="font-size: 15px; margin: 24px 0 8px;">Backup del catálogo</h2>
    <p style="margin: 0; color: ${color}; font-size: 13px;">${icon} ${detail}</p>
  `;
}

function renderErrorsSection(s: DigestSummary): string {
  if (s.errors.length === 0) {
    return `
      <h2 style="font-size: 15px; margin: 24px 0 8px;">Errores de los últimos 7 días</h2>
      <p style="margin: 0; color: #16a34a; font-size: 13px;">✓ Sin errores logueados esta semana.</p>
    `;
  }
  const rows = s.errors
    .map(
      (e) => `
      <tr>
        <td style="padding: 6px; border-bottom: 1px solid #e5e7eb;">${escape(e.scope)}</td>
        <td style="padding: 6px; border-bottom: 1px solid #e5e7eb; text-align: right;">${e.count}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding: 0 6px 6px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #64748b;">
          Último: <em>${escape(e.lastMessage.slice(0, 200))}</em>
        </td>
      </tr>`,
    )
    .join("");
  return `
    <h2 style="font-size: 15px; margin: 24px 0 8px;">
      Errores de los últimos 7 días (${s.totalErrors} total, top ${s.errors.length})
    </h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">${rows}</table>
  `;
}

function statusDot(status: "ok" | "warn" | "error"): string {
  const color = status === "ok" ? "#16a34a" : status === "warn" ? "#d97706" : "#dc2626";
  return `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${color}; margin-right: 8px;"></span>`;
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
