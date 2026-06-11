/**
 * Cliente de la API del ERP Griffo (middleware sobre Bejerman). SERVER ONLY.
 *
 * Base URL: env BEJERMAN_API_URL (default http://griffo.stidns.net:86/api).
 * Auth: JWT Bearer. POST /Auth/login con email+password → token. Token
 * cacheado en memoria del proceso (55 min). Re-auth automático en 401.
 *
 * ⚠️ El middleware responde HTTP (no HTTPS). Las llamadas sólo se hacen
 * desde server-side (API routes de Next.js). Cuando el técnico habilite
 * TLS, cambiar la env var.
 *
 * Docs: reference/bejerman/README.md.
 */

import "server-only";

import type {
  BejermanAccountStatusItem,
  BejermanClient,
  BejermanComprobanteQuery,
  BejermanOrderRequest,
  BejermanOrderResponse,
  BejermanOrderStatus,
  BejermanPriceItem,
  BejermanPriceRequest,
} from "@/types/bejerman";

const DEFAULT_BASE_URL = "http://intranet.remotogriffo.com.ar:86/api";
const TOKEN_TTL_MS = 55 * 60 * 1000;

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;
let inflightLogin: Promise<string> | null = null;

function baseUrl(): string {
  return process.env.BEJERMAN_API_URL || DEFAULT_BASE_URL;
}

async function login(): Promise<string> {
  // El campo JSON se llama "email" en la API, pero acepta username
  // también (el técnico provisionó `WebGriffo`, por ejemplo). Para
  // claridad en Vercel mantenemos el nombre BEJERMAN_EMAIL — admite
  // ambos tipos de credencial.
  const email = process.env.BEJERMAN_EMAIL;
  const password = process.env.BEJERMAN_PASSWORD;
  if (!email || !password) {
    throw new Error("BEJERMAN_EMAIL y BEJERMAN_PASSWORD no configurados");
  }

  const res = await fetch(`${baseUrl()}/Auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      twoFactorCode: "",
      twoFactorRecoveryCode: "",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bejerman auth falló (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("Bejerman auth: respuesta sin token");
  return data.token;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  if (inflightLogin) return inflightLogin;

  inflightLogin = (async () => {
    try {
      const token = await login();
      tokenCache = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
      return token;
    } finally {
      inflightLogin = null;
    }
  })();
  return inflightLogin;
}

type RequestOpts = RequestInit & { _retried?: boolean };

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(opts.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (opts.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${baseUrl()}${path}`, {
    ...opts,
    headers,
    cache: "no-store",
  });

  if (res.status === 401 && !opts._retried) {
    tokenCache = null;
    return request<T>(path, { ...opts, _retried: true });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bejerman ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function requestBinary(
  path: string,
  retried = false,
): Promise<{ buffer: Buffer; contentType: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (res.status === 401 && !retried) {
    tokenCache = null;
    return requestBinary(path, true);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bejerman ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

/**
 * Lista todos los clientes registrados en el ERP con sus depósitos.
 *
 * El middleware devuelve el CUIT como `tax_id`. Acá lo mapeamos a `cuit`
 * que es el nombre que usa la web. Cualquier otro campo que el ERP
 * agregue en el futuro se propaga tal cual.
 */
export async function getClients(): Promise<BejermanClient[]> {
  type Raw = BejermanClient & { tax_id?: string; price_list_code?: string };
  const raws = await request<Raw[]>("/ERP/Clients");
  return raws.map((r) => ({
    ...r,
    cuit: r.cuit ?? r.tax_id,
    priceListCode: r.priceListCode ?? r.price_list_code,
  }));
}

/** Cotiza precios + stock para un cliente + depósito + set de códigos. */
export function getPrices(body: BejermanPriceRequest): Promise<BejermanPriceItem[]> {
  return request<BejermanPriceItem[]>("/ERP/prices", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Crea un pedido en el ERP. */
export function createOrder(body: BejermanOrderRequest): Promise<BejermanOrderResponse> {
  return request<BejermanOrderResponse>("/ERP/order", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Estado actual de un pedido previamente creado. */
export function getOrderStatus(erpOrderId: string): Promise<BejermanOrderStatus> {
  return request<BejermanOrderStatus>(
    `/ERP/orders/${encodeURIComponent(erpOrderId)}`,
  );
}

/**
 * Estado de cuenta del cliente: comprobantes (FC, ND, NC, …) con debe/haber.
 * De acá sale tanto la cuenta corriente como el listado de facturas
 * (filtrar `comp === "FC"`). El saldo es `sum(debe) - sum(haber)`.
 */
export function getClientAccountStatus(
  clientCode: string,
): Promise<BejermanAccountStatusItem[]> {
  return request<BejermanAccountStatusItem[]>(
    `/ERP/ClientAccountStatus/${encodeURIComponent(clientCode)}`,
  );
}

/**
 * Descarga el PDF de un comprobante. Los 5 params vienen 1:1 de un item de
 * `getClientAccountStatus`. 404 si el PDF no está emitido todavía.
 */
export function getComprobantePdf(q: BejermanComprobanteQuery) {
  const params = new URLSearchParams({
    Comp: q.Comp,
    PuntoVenta: q.PuntoVenta,
    CompNro: q.CompNro,
    CodCliente: q.CodCliente,
  });
  // La API exige que CompLetra esté presente aunque sea vacía
  // (error 400 "The CompLetra field is required" si se omite).
  params.set("CompLetra", q.CompLetra ?? "");
  return requestBinary(`/ERP/GetComprobante?${params.toString()}`);
}

/** Cambia la contraseña del usuario API. Uso sólo administrativo. */
export function changeApiPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ message: string }> {
  return request<{ message: string }>("/Auth/change_password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

/**
 * Lista los pedidos pendientes de entrega para un cliente.
 *
 * Endpoint confirmado por el técnico el 2026-04-21:
 *
 *   GET /ERP/clientes/{clientCode}/pedidos
 *
 * Devuelve los pedidos cargados en Bejerman para ese cliente
 * (independiente de si se crearon desde la web o directo en el ERP).
 * Los pedidos vienen ordenados por fecha descendente — los más nuevos
 * primero. El historial incluye pedidos viejos con estado "Pendiente"
 * (en el ERP sólo hay 2 estados: Pendiente / Facturado).
 *
 * Si el endpoint falla (credenciales ausentes, red caída, 5xx), se
 * loguea y se devuelve []. Así el portal sigue mostrando al menos los
 * pedidos locales.
 */
export interface BejermanPendingOrder {
  erpOrderId: string;
  /** ISO date-time de creación en Bejerman. */
  createdAt: string;
  /** Fecha estimada de despacho, si ya se asignó. */
  estimatedDispatchDate?: string;
  status: string;
  itemCount: number;
  total: number;
  /** Sucursal/depósito del pedido. El ERP puede mandar distintos nombres. */
  sucursal?: string;
  warehouseId?: string;
  warehouseDescription?: string;
  deposito?: string;
}

/** Status strings de Bejerman que se consideran cancelados (case-insensitive). */
const CANCELLED_STATUSES = ["cancelado", "cancelled", "anulado"];

function isCancelled(order: BejermanPendingOrder): boolean {
  return CANCELLED_STATUSES.some((s) =>
    order.status.toLowerCase().includes(s),
  );
}

export async function getPendingOrdersForClient(
  clientCode: string,
): Promise<BejermanPendingOrder[]> {
  try {
    const raw = await request<BejermanPendingOrder[]>(
      `/ERP/clientes/${encodeURIComponent(clientCode)}/pedidos`,
    );
    if (!Array.isArray(raw)) {
      console.error(
        `[bejerman] getPendingOrdersForClient(${clientCode}): respuesta no es array:`,
        JSON.stringify(raw ?? null).slice(0, 200),
      );
      return [];
    }
    // Excluir pedidos cancelados — no se muestran en el portal.
    return raw.filter((o) => !isCancelled(o));
  } catch (e) {
    // Logueamos siempre (no sólo en dev) porque ahora el endpoint
    // existe — cualquier fallo es un bug real que hay que mirar.
    console.error(
      `[bejerman] getPendingOrdersForClient(${clientCode}) falló:`,
      e,
    );
    return [];
  }
}
