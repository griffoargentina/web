import { listCatalog } from "@/lib/api/specparts";
import { getRedis } from "@/lib/kv";

/**
 * Health checks de los servicios externos que el sitio usa. Cada check
 * devuelve `ok` (verde), `warn` (amarillo) o `error` (rojo) + un
 * mensaje corto en lenguaje común para la cliente + detail técnico.
 *
 * Se corren en paralelo con Promise.allSettled para que un servicio
 * caído no rompa la verificación del resto.
 *
 * Agrupados en 2 secciones:
 *   - `sitio`: servicios que alimentan el sitio público + admin.
 *   - `b2b`: servicios del portal de clientes mayoristas (/cuenta/*).
 */

export type HealthStatus = "ok" | "warn" | "error";
export type HealthGroup = "sitio" | "b2b";

export type HealthCheck = {
  id: string;
  label: string;
  /** Explicación corta: qué alimenta este servicio. */
  purpose: string;
  /** Grupo para agrupar en la UI. */
  group: HealthGroup;
  status: HealthStatus;
  message: string;
  /** Detalle técnico opcional para mostrar en hover/tooltip. */
  detail?: string;
};

export async function runHealthChecks(): Promise<HealthCheck[]> {
  const [sp, plate, redis, blob, resend, bejerman] = await Promise.allSettled([
    checkSpecParts(),
    checkPlateLookup(),
    checkRedis(),
    checkBlob(),
    checkResend(),
    checkBejerman(),
  ]);

  return [
    settledToCheck(
      "specparts",
      "Catálogo de productos",
      "Alimenta el catálogo y las novedades con los 370+ productos Griffo",
      "sitio",
      sp
    ),
    settledToCheck(
      "plate-lookup",
      "Búsqueda por patente",
      "Identifica el vehículo desde la patente para filtrar productos en el catálogo",
      "sitio",
      plate
    ),
    settledToCheck(
      "redis",
      "Base de datos",
      "Guarda los leads de formularios, sesiones del admin, novedades y links de descargas",
      "sitio",
      redis
    ),
    settledToCheck(
      "blob",
      "Subida de archivos",
      "Permite subir catálogos PDF, flyers, videos y banco de imágenes desde el admin",
      "sitio",
      blob
    ),
    settledToCheck(
      "resend",
      "Envío de emails",
      "Notifica por email cuando un cliente completa un formulario de contacto, garantía, etc.",
      "sitio",
      resend
    ),
    settledToCheck(
      "bejerman",
      "ERP de Griffo",
      "Conexión con el sistema interno (Bejerman) — alimenta el portal de clientes mayoristas con precios, pedidos y cuenta corriente",
      "b2b",
      bejerman
    ),
  ];
}

function settledToCheck(
  id: string,
  label: string,
  purpose: string,
  group: HealthGroup,
  res: PromiseSettledResult<Omit<HealthCheck, "id" | "label" | "purpose" | "group">>
): HealthCheck {
  if (res.status === "fulfilled") {
    return { id, label, purpose, group, ...res.value };
  }
  return {
    id,
    label,
    purpose,
    group,
    status: "error",
    message: "Error inesperado",
    detail: String(res.reason),
  };
}

type CheckResult = Omit<HealthCheck, "id" | "label" | "purpose" | "group">;

async function checkSpecParts(): Promise<CheckResult> {
  if (!process.env.SPECPARTS_CLIENT_ID || !process.env.SPECPARTS_CLIENT_SECRET) {
    return {
      status: "error",
      message: "No configurado",
      detail: "Faltan las env vars SPECPARTS_CLIENT_ID / SPECPARTS_CLIENT_SECRET",
    };
  }
  try {
    const products = await listCatalog();
    return {
      status: "ok",
      message: `Funcionando — ${products.length} productos`,
    };
  } catch (e) {
    return {
      status: "error",
      message: "No responde",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const redis = getRedis();
  if (!redis) {
    return {
      status: "error",
      message: "No configurado",
      detail: "Faltan las env vars KV_REST_API_URL / KV_REST_API_TOKEN",
    };
  }
  try {
    const res = await redis.ping();
    if (res === "PONG") {
      return { status: "ok", message: "Conectado" };
    }
    return {
      status: "warn",
      message: `Respuesta inesperada: ${String(res)}`,
    };
  } catch (e) {
    return {
      status: "error",
      message: "No responde",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function checkBlob(): Promise<CheckResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      status: "warn",
      message: "No configurado",
      detail:
        "Falta BLOB_READ_WRITE_TOKEN — los uploads del admin no van a funcionar",
    };
  }
  return {
    status: "ok",
    message: "Configurado",
    detail:
      "No se hace ping real (no hay endpoint barato). Solo chequeo de configuración.",
  };
}

async function checkResend(): Promise<CheckResult> {
  if (!process.env.RESEND_API_KEY) {
    return {
      status: "error",
      message: "No configurado",
      detail: "Falta RESEND_API_KEY — los forms no mandan email",
    };
  }
  return {
    status: "ok",
    message: "Configurado",
    detail:
      "Mails salen desde contacto@griffo.com.ar (dominio griffo.com.ar verificado en Resend).",
  };
}

async function checkPlateLookup(): Promise<CheckResult> {
  const redis = getRedis();
  if (!redis) {
    return {
      status: "warn",
      message: "Sin datos",
      detail: "Redis no disponible — no se puede verificar el estado del endpoint de patente.",
    };
  }
  try {
    const raw = await redis.get<string>("plate:last-status");
    if (!raw) {
      return {
        status: "warn",
        message: "Sin consultas recientes",
        detail: "No hubo búsquedas por patente en las últimas 48h — no se puede verificar. Si SpecParts está throttleado, aparecerá aquí en rojo la próxima vez que alguien busque.",
      };
    }
    const parsed = (
      typeof raw === "string" ? JSON.parse(raw) : raw
    ) as { ok: boolean; throttled?: boolean; at: number };
    const minsAgo = Math.round((Date.now() - parsed.at) / 60_000);
    const timeLabel = minsAgo < 60
      ? `hace ${minsAgo} min`
      : `hace ${Math.round(minsAgo / 60)} h`;

    if (parsed.throttled) {
      return {
        status: "error",
        message: "Throttleada por SpecParts (429)",
        detail: `Última consulta ${timeLabel} devolvió 429. Búsquedas por patente no disponibles hasta que SpecParts resetee el cupo de GRIFFO-ARG.`,
      };
    }
    return {
      status: "ok",
      message: `Funcionando — última consulta exitosa ${timeLabel}`,
    };
  } catch (e) {
    return {
      status: "warn",
      message: "No se pudo verificar",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function checkBejerman(): Promise<CheckResult> {
  const hasCreds = !!(process.env.BEJERMAN_EMAIL && process.env.BEJERMAN_PASSWORD);
  if (!hasCreds) {
    return {
      status: "error",
      message: "No configurado",
      detail:
        "Faltan BEJERMAN_EMAIL / BEJERMAN_PASSWORD — el portal B2B usa datos mock. Pedirle al técnico las credenciales reales (ver reference/bejerman/).",
    };
  }
  // Intentamos login. Usamos un timeout de 5s para no bloquear el
  // dashboard si el ERP es lento o está caído.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = process.env.BEJERMAN_API_URL ?? "http://intranet.remotogriffo.com.ar:86/api";
    const res = await fetch(`${url}/Auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.BEJERMAN_EMAIL,
        password: process.env.BEJERMAN_PASSWORD,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      // La URL default ya apunta al server productivo del técnico, así
      // que no warneamos cuando no hay override explícito.
      return { status: "ok", message: "Conectado" };
    }
    if (res.status === 401) {
      return {
        status: "error",
        message: "Credenciales inválidas (401)",
        detail:
          "Login rechazado por el ERP. Verificar BEJERMAN_EMAIL y BEJERMAN_PASSWORD con el técnico.",
      };
    }
    return {
      status: "error",
      message: `HTTP ${res.status}`,
      detail: `El ERP respondió ${res.status} ${res.statusText}`,
    };
  } catch (e) {
    clearTimeout(timeout);
    const err = e instanceof Error ? e.message : String(e);
    if (err.includes("abort")) {
      return {
        status: "error",
        message: "Timeout (5s)",
        detail: "El ERP no respondió a tiempo. Quizás está caído o la URL es incorrecta.",
      };
    }
    return {
      status: "error",
      message: "No responde",
      detail: err,
    };
  }
}
