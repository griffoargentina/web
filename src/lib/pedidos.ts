import { getRedis } from "@/lib/kv";
import type {
  Pedido,
  PedidoItem,
  PedidoStatus,
} from "@/types/pedido";

/**
 * Persistencia de pedidos B2B en Upstash Redis.
 *
 * Layout de claves:
 *
 *   pedido:<id>                 → Hash con el JSON del pedido.
 *   pedidos:all                 → Sorted set, score = createdAt ms.
 *   pedidos:por-cliente:<cid>   → Sorted set, mismo score.
 *   pedidos:por-estado:<status> → Sorted set, mismo score.
 *   pedidos:counter:<YYYYMMDD>  → INCR para generar el correlativo del id.
 *
 * Todas las funciones son server-only (usan `@/lib/kv`). Si Redis no está
 * configurado, lanzan error salvo las que explícitamente toleran ausencia
 * (`listPedidosAll`, `listPedidosByClient`, `listPedidosByStatus`), que
 * devuelven `[]`.
 *
 * Cuando haya Firebase Auth, el `clientId` viene del mapeo
 * `user.email → /ERP/Clients`. Hoy la API acepta el `clientId` que
 * mande el cliente — la sesión mock no valida. Validar en el handler.
 */

const KEY_PREFIX = "pedido:";
const KEY_ALL = "pedidos:all";
const KEY_BY_CLIENT = "pedidos:por-cliente:";
const KEY_BY_STATUS = "pedidos:por-estado:";
const KEY_COUNTER = "pedidos:counter:";

/* -------------------------------------------------------------------------- */
/* ID generator                                                               */
/* -------------------------------------------------------------------------- */

function todayStamp(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function generatePedidoId(): Promise<string> {
  const redis = getRedis();
  if (!redis) {
    // Sin Redis (dev local sin env vars): fallback a timestamp puro.
    return `web-${todayStamp()}-${Date.now().toString().slice(-4)}`;
  }
  const stamp = todayStamp();
  const key = KEY_COUNTER + stamp;
  const n = await redis.incr(key);
  // TTL de 48 hs para no dejar basura — el correlativo se reinicia cada día.
  if (n === 1) await redis.expire(key, 60 * 60 * 48);
  return `web-${stamp}-${String(n).padStart(4, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* CRUD                                                                       */
/* -------------------------------------------------------------------------- */

export interface CreatePedidoInput {
  clientId: string;
  clientName: string;
  clientEmail: string;
  warehouseId: string;
  warehouseDescription: string;
  items: Array<Omit<PedidoItem, "subtotal"> & { subtotal?: number }>;
}

export async function createPedido(input: CreatePedidoInput): Promise<Pedido> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis no configurado — no se puede guardar pedido");

  if (input.items.length === 0) {
    throw new Error("El pedido no puede estar vacío");
  }

  const items: PedidoItem[] = input.items.map((it) => ({
    ...it,
    quantity: Math.max(1, Math.floor(it.quantity)),
    subtotal:
      typeof it.subtotal === "number"
        ? it.subtotal
        : it.unitPrice * it.quantity,
  }));
  const total = items.reduce((a, it) => a + it.subtotal, 0);

  const id = await generatePedidoId();
  const now = new Date().toISOString();
  const pedido: Pedido = {
    id,
    clientId: input.clientId,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    warehouseId: input.warehouseId,
    warehouseDescription: input.warehouseDescription,
    items,
    total,
    status: "procesando",
    createdAt: now,
    updatedAt: now,
  };

  const score = Date.parse(now);
  await Promise.all([
    redis.set(KEY_PREFIX + id, JSON.stringify(pedido)),
    redis.zadd(KEY_ALL, { score, member: id }),
    redis.zadd(KEY_BY_CLIENT + input.clientId, { score, member: id }),
    redis.zadd(KEY_BY_STATUS + pedido.status, { score, member: id }),
  ]);

  return pedido;
}

export async function getPedido(id: string): Promise<Pedido | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get<string | Pedido | null>(KEY_PREFIX + id);
  if (!raw) return null;
  return typeof raw === "string" ? (JSON.parse(raw) as Pedido) : raw;
}

async function listIds(
  redis: ReturnType<typeof getRedis>,
  key: string,
  limit: number,
): Promise<string[]> {
  if (!redis) return [];
  // zrange con rev para traer los más nuevos primero.
  const ids = await redis.zrange<string[]>(key, 0, Math.max(0, limit - 1), {
    rev: true,
  });
  return ids ?? [];
}

async function fetchMany(
  redis: ReturnType<typeof getRedis>,
  ids: string[],
): Promise<Pedido[]> {
  if (!redis || ids.length === 0) return [];
  const raws = await Promise.all(
    ids.map((id) => redis.get<string | Pedido | null>(KEY_PREFIX + id)),
  );
  return raws
    .map((raw) =>
      raw == null ? null : typeof raw === "string" ? (JSON.parse(raw) as Pedido) : raw,
    )
    .filter((x): x is Pedido => x !== null);
}

export async function listPedidosAll(limit = 200): Promise<Pedido[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = await listIds(redis, KEY_ALL, limit);
  return fetchMany(redis, ids);
}

export async function listPedidosByClient(
  clientId: string,
  limit = 100,
): Promise<Pedido[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = await listIds(redis, KEY_BY_CLIENT + clientId, limit);
  return fetchMany(redis, ids);
}

export async function listPedidosByStatus(
  status: PedidoStatus,
  limit = 200,
): Promise<Pedido[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = await listIds(redis, KEY_BY_STATUS + status, limit);
  return fetchMany(redis, ids);
}

/* -------------------------------------------------------------------------- */
/* Transiciones de estado                                                     */
/* -------------------------------------------------------------------------- */

async function persist(pedido: Pedido, oldStatus?: PedidoStatus): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis no configurado");

  pedido.updatedAt = new Date().toISOString();
  const ops: Promise<unknown>[] = [
    redis.set(KEY_PREFIX + pedido.id, JSON.stringify(pedido)),
  ];
  if (oldStatus && oldStatus !== pedido.status) {
    const score = Date.parse(pedido.createdAt);
    ops.push(
      redis.zrem(KEY_BY_STATUS + oldStatus, pedido.id),
      redis.zadd(KEY_BY_STATUS + pedido.status, { score, member: pedido.id }),
    );
  }
  await Promise.all(ops);
}

export async function markEnPreparacion(
  id: string,
  opts: { erpOrderNumber: string; estimatedDispatchDate?: string },
): Promise<Pedido> {
  const pedido = await getPedido(id);
  if (!pedido) throw new Error(`Pedido ${id} no existe`);
  const old = pedido.status;
  pedido.status = "en_preparacion";
  pedido.erpOrderNumber = opts.erpOrderNumber.trim();
  if (opts.estimatedDispatchDate) {
    pedido.estimatedDispatchDate = opts.estimatedDispatchDate;
  }
  await persist(pedido, old);
  return pedido;
}

export async function markEntregado(
  id: string,
  opts: {
    invoiceNumber?: string;
    invoiceComp?: string;
    invoiceCompLetra?: string;
    invoicePuntoVenta?: string;
    invoiceCompNro?: string;
    invoiceEmissionDate?: string;
  } = {},
): Promise<Pedido> {
  const pedido = await getPedido(id);
  if (!pedido) throw new Error(`Pedido ${id} no existe`);
  const old = pedido.status;
  pedido.status = "entregado";
  if (opts.invoiceComp && opts.invoicePuntoVenta && opts.invoiceCompNro) {
    const label =
      opts.invoiceNumber ??
      `${opts.invoiceComp} ${opts.invoiceCompLetra ?? ""}${opts.invoicePuntoVenta}-${opts.invoiceCompNro}`.trim();
    pedido.invoice = {
      comp: opts.invoiceComp,
      compLetra: opts.invoiceCompLetra ?? "",
      puntoVenta: opts.invoicePuntoVenta,
      compNro: opts.invoiceCompNro,
      label,
      emissionDate: opts.invoiceEmissionDate ?? new Date().toISOString(),
    };
  }
  await persist(pedido, old);
  return pedido;
}

/**
 * Guarda el status del ERP (`Pendiente` / `Facturado` / lo que venga)
 * sin cambiar el status interno de la web. Se dispara desde el webhook
 * ante eventos `order.status_changed` que no alcanzan para mover el
 * pedido a otro estado del flujo web (ese es `order.invoiced`).
 */
export async function persistErpStatus(
  id: string,
  erpStatus: string,
): Promise<Pedido> {
  const pedido = await getPedido(id);
  if (!pedido) throw new Error(`Pedido ${id} no existe`);
  pedido.erpStatus = erpStatus || undefined;
  await persist(pedido);
  return pedido;
}

export async function cancelPedido(
  id: string,
  reason?: string,
): Promise<Pedido> {
  const pedido = await getPedido(id);
  if (!pedido) throw new Error(`Pedido ${id} no existe`);
  if (pedido.status !== "procesando") {
    throw new Error(
      `Solo se puede cancelar un pedido en estado "procesando" (actual: "${pedido.status}")`,
    );
  }
  const old = pedido.status;
  pedido.status = "cancelado";
  pedido.cancelledAt = new Date().toISOString();
  if (reason) pedido.cancelReason = reason.trim();
  await persist(pedido, old);
  return pedido;
}

/** Actualiza la descripción de sucursal de un pedido (corrección manual desde el admin). */
export async function patchWarehouse(
  id: string,
  warehouseDescription: string,
): Promise<Pedido> {
  const pedido = await getPedido(id);
  if (!pedido) throw new Error(`Pedido ${id} no existe`);
  pedido.warehouseDescription = warehouseDescription.trim();
  await persist(pedido);
  return pedido;
}
