import crypto from 'node:crypto';
import type { SessionUser } from '@/core/auth/session';
import { query, transaction } from '@/core/db';
import { getConfig } from '@/core/env';
import { getIntegerSetting } from '@/core/settings/service';
import { AppError } from '@/core/errors';
import { requireNormalizedPhone } from '@/core/phone';
import { getPointById } from '@/core/points/service';
import { formatMiassTime, getMiassDayBounds } from '@/core/time';
import { COFFEE_SETTING_KEYS } from '../settings/definitions';

export type OrderStatus =
  | 'new'
  | 'accepted'
  | 'cooking'
  | 'ready'
  | 'done'
  | 'cancelled';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Новый',
  accepted: 'Принят',
  cooking: 'Готовится',
  ready: 'Готов',
  done: 'Выдан',
  cancelled: 'Отменён',
};

export const STAFF_CANCEL_REASONS: Record<string, string> = {
  no_show: 'Гость не пришёл',
  out_of_stock: 'Нет позиции',
  point_closed: 'Точка закрыта',
  guest_request: 'По просьбе гостя',
  other: 'Другое',
};

export interface OrderModifierSnapshot {
  groupName: string;
  optionName: string;
  priceDelta: number;
}

export interface OrderItemDto {
  id: number;
  productId: number | null;
  productName: string;
  unitPrice: number;
  modifiers: OrderModifierSnapshot[];
  quantity: number;
  lineTotal: number;
}

export interface GuestOrderDto {
  number: string;
  accessKey: string;
  pointId: number;
  pointName: string;
  pointAddress: string;
  pointPhone: string;
  customerName: string;
  customerPhone: string;
  comment: string;
  pickupAt: string;
  pickupTimeFormatted: string;
  isAsap: boolean;
  pickupTimeAdjusted: boolean;
  total: number;
  /** Заказ дороже порога: сотрудник звонит гостю перед принятием */
  requiresCall: boolean;
  status: OrderStatus;
  statusLabel: string;
  cancelReasonLabel: string | null;
  isLinkedToProfile: boolean;
  createdAt: string;
  items: OrderItemDto[];
}

export interface OrderHistoryEntryDto {
  id: number;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorUserId: number | null;
  actorName: string | null;
  actorRole: string;
  cancelReason: string | null;
  cancelReasonLabel: string | null;
  cancelComment: string | null;
  createdAt: string;
}

export interface StaffOrderDto {
  id: number;
  number: string;
  accessKey: string;
  pointId: number;
  pointName: string;
  pointAddress: string;
  customerName: string;
  customerPhone: string;
  comment: string;
  pickupAt: string;
  pickupTimeFormatted: string;
  isAsap: boolean;
  pickupTimeAdjusted: boolean;
  total: number;
  requiresCall: boolean;
  callConfirmedAt: string | null;
  status: OrderStatus;
  statusLabel: string;
  noShowCount: number;
  cancelReasonLabel: string | null;
  createdAt: string;
  items: OrderItemDto[];
  history?: OrderHistoryEntryDto[];
}

export interface CreateOrderItemInput {
  productId: number;
  optionIds: number[];
  quantity: number;
}

export interface CreateOrderInput {
  idempotencyKey: string;
  pointId: number;
  isAsap: boolean;
  pickupTime?: string; // HH:MM
  customerName: string;
  customerPhone: string;
  comment?: string;
  // Необязательное поле для совместимости: согласие даётся фактом оформления заказа
  consent?: boolean;
  items: CreateOrderItemInput[];
}

const ALLOWED_NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  new: 'accepted',
  accepted: 'cooking',
  cooking: 'ready',
  ready: 'done',
  done: null,
  cancelled: null,
};

function formatCancelReason(
  reason: string | null | undefined,
  comment: string | null | undefined
): string | null {
  if (!reason) return null;
  if (reason === 'guest_self') return 'Отменён вами';
  const base = STAFF_CANCEL_REASONS[reason] || reason;
  if (reason === 'other' && comment?.trim()) {
    return `${base}: ${comment.trim()}`;
  }
  if (comment?.trim()) {
    return `${base} (${comment.trim()})`;
  }
  return base;
}

export async function getNoShowCountByPhone(phone: string): Promise<number> {
  const cfg = getConfig();
  if (!cfg.enableNoShowCounter) {
    return 0;
  }

  const res = await query<{ cnt: string }>(
    `SELECT COUNT(DISTINCT o.id)::text AS cnt
     FROM coffee_orders o
     JOIN coffee_order_status_history h ON h.order_id = o.id
     WHERE o.customer_phone = $1
       AND o.status = 'cancelled'
       AND h.to_status = 'cancelled'
       AND h.cancel_reason = 'no_show'`,
    [phone]
  );

  return Number(res.rows[0]?.cnt ?? 0);
}

// Алфавит без похожих символов (0/O, 1/I/L) — номер диктуют и вводят с телефона
const ORDER_NUMBER_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Случайный номер заказа: 6 символов, обязательно есть буква и цифра.
 * Номер используют для выдачи. Для доступа к заказу служит отдельный accessKey.
 */
function generateOrderNumber(): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ORDER_NUMBER_ALPHABET[crypto.randomInt(ORDER_NUMBER_ALPHABET.length)];
    }
    if (/[A-Z]/.test(code) && /[2-9]/.test(code)) return code;
  }
}

export async function createCoffeeOrder(
  input: CreateOrderInput,
  actor: SessionUser | null = null,
  now: Date = new Date()
): Promise<GuestOrderDto> {
  if (actor && actor.role !== 'client') {
    throw new AppError(
      403,
      'STAFF_CANNOT_ORDER',
      'Сотрудники не могут оформлять заказы из служебной учётной записи'
    );
  }

  const fields: Record<string, string> = {};
  const customerName = (input.customerName ?? '').trim();
  if (customerName.length < 2 || customerName.length > 40) {
    fields.customerName = 'Имя должно быть от 2 до 40 символов';
  }

  const customerPhone = requireNormalizedPhone(input.customerPhone, 'customerPhone');

  const comment = (input.comment ?? '').trim();
  if (comment.length > 200) {
    fields.comment = 'Комментарий не должен превышать 200 символов';
  }

  if (!input.items || input.items.length === 0) {
    throw new AppError(400, 'EMPTY_CART', 'Корзина пуста');
  }

  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
      throw new AppError(
        400,
        'INVALID_QUANTITY',
        'Количество одной позиции должно быть от 1 до 20'
      );
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', Object.values(fields)[0], fields);
  }

  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Не указан ключ идемпотентности');
  }

  // Проверяем существующий заказ по idempotency_key до старта новой транзакции
  const existingOrder = await query<{ access_key: string }>(
    'SELECT access_key FROM coffee_orders WHERE idempotency_key = $1',
    [idempotencyKey]
  );
  if (existingOrder.rowCount > 0) {
    return (await getOrderByAccessKeyForGuest(existingOrder.rows[0].access_key))!;
  }

  // Проверяем точку, её сервис и часы работы
  const point = await getPointById(input.pointId, now);
  if (!point || point.isHidden) {
    throw new AppError(400, 'POINT_UNAVAILABLE', 'Выбранная точка недоступна');
  }
  if (!point.services.includes('coffee')) {
    throw new AppError(400, 'SERVICE_DISABLED', 'Сервис кофе отключён на этой точке');
  }
  if (!point.acceptsOrders) {
    throw new AppError(409, 'POINT_CLOSED', 'Точка сейчас не принимает заказы');
  }
  if (!point.isOpenNow) {
    throw new AppError(
      409,
      'POINT_CLOSED',
      point.closedUntilLabel || 'Точка сейчас закрыта'
    );
  }
  if (!point.hasSlotsToday || point.slots.length === 0) {
    throw new AppError(
      409,
      'NO_SLOTS_TODAY',
      'Сегодня эта точка больше не принимает заказы'
    );
  }

  let selectedPickupIso: string;
  if (input.isAsap) {
    if (!point.asapSlot) {
      throw new AppError(
        409,
        'NO_SLOTS_TODAY',
        'Сегодня эта точка больше не принимает заказы'
      );
    }
    selectedPickupIso = point.asapSlot.iso;
  } else {
    const requestedTime = input.pickupTime?.trim();
    if (!requestedTime) {
      throw new AppError(400, 'SLOT_REQUIRED', 'Выберите время получения', {
        pickupTime: 'Выберите время получения',
      });
    }
    const matchingSlot = point.slots.find((s) => s.time === requestedTime);
    if (!matchingSlot) {
      throw new AppError(
        409,
        'SLOT_UNAVAILABLE',
        'Выбранный слот уже недоступен. Пожалуйста, выберите другое время.'
      );
    }
    selectedPickupIso = matchingSlot.iso;
  }

  const maxActiveOrdersPerPhone = await getIntegerSetting(
    COFFEE_SETTING_KEYS.maxActiveOrdersPerPhone,
    0
  );
  const callConfirmThreshold = await getIntegerSetting(
    COFFEE_SETTING_KEYS.callConfirmThreshold,
    1000
  );

  const accessKey = await transaction(async (tx) => {
    const dupCheck = await tx.query<{ access_key: string }>(
      'SELECT access_key FROM coffee_orders WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    if (dupCheck.rowCount > 0) {
      return dupCheck.rows[0].access_key;
    }

    // Лимит одновременных заказов на номер телефона: по умолчанию не ограничен,
    // меняется в админке (п. 4.4 ТЗ)
    if (maxActiveOrdersPerPhone > 0) {
      const activeRes = await tx.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt
         FROM coffee_orders
         WHERE customer_phone = $1
           AND status NOT IN ('done', 'cancelled')`,
        [customerPhone]
      );
      const activeCount = Number(activeRes.rows[0]?.cnt ?? 0);
      if (activeCount >= maxActiveOrdersPerPhone) {
        throw new AppError(
          409,
          'ACTIVE_ORDERS_LIMIT',
          maxActiveOrdersPerPhone === 1
            ? 'У вас уже есть активный заказ. Дождитесь выдачи или отмените его'
            : `На этот номер уже оформлено ${activeCount} активных заказа — это максимум. Дождитесь выдачи или отмените один из них`
        );
      }
    }

    // Проверка всех товаров и модификаторов и расчёт цены на сервере
    const preparedItems: Array<{
      productId: number;
      productName: string;
      unitPrice: number;
      modifiers: OrderModifierSnapshot[];
      quantity: number;
      lineTotal: number;
    }> = [];

    let orderTotal = 0;

    const stoppedAtPoint = await tx.query<{ product_id: number }>(
      'SELECT product_id FROM coffee_point_stop_list WHERE point_id = $1',
      [point.id]
    );
    const stoppedIds = new Set(stoppedAtPoint.rows.map((r) => r.product_id));

    for (const item of input.items) {
      const prodRes = await tx.query<{
        id: number;
        name: string;
        base_price: number;
        is_published: boolean;
        in_stock: boolean;
        deleted_at: string | null;
        cat_published: boolean;
      }>(
        `SELECT p.id, p.name, p.base_price, p.is_published, p.in_stock, p.deleted_at,
                c.is_published AS cat_published
         FROM coffee_products p
         JOIN coffee_categories c ON c.id = p.category_id
         WHERE p.id = $1`,
        [item.productId]
      );

      if (prodRes.rowCount === 0) {
        throw new AppError(409, 'PRODUCT_UNAVAILABLE', 'Позиция недоступна');
      }

      const prod = prodRes.rows[0];
      if (
        prod.deleted_at !== null ||
        !prod.is_published ||
        !prod.in_stock ||
        !prod.cat_published ||
        stoppedIds.has(prod.id)
      ) {
        throw new AppError(
          409,
          'PRODUCT_UNAVAILABLE',
          `Позиция «${prod.name}» сейчас недоступна`
        );
      }

      const groupsRes = await tx.query<{
        id: number;
        name: string;
        select_type: 'single' | 'multiple';
        is_required: boolean;
      }>(
        `SELECT g.id, g.name, g.select_type, g.is_required
         FROM coffee_product_modifier_groups pmg
         JOIN coffee_modifier_groups g ON g.id = pmg.group_id
         WHERE pmg.product_id = $1
         ORDER BY pmg.sort_order ASC, g.id ASC`,
        [prod.id]
      );

      const attachedGroupIds = groupsRes.rows.map((g) => g.id);
      let optionsRows: Array<{
        id: number;
        group_id: number;
        name: string;
        price_delta: number;
        is_available: boolean;
      }> = [];

      if (attachedGroupIds.length > 0) {
        const optsRes = await tx.query<{
          id: number;
          group_id: number;
          name: string;
          price_delta: number;
          is_available: boolean;
        }>(
          `SELECT id, group_id, name, price_delta, is_available
           FROM coffee_modifier_options
           WHERE group_id = ANY($1::int[])
           ORDER BY sort_order ASC, id ASC`,
          [attachedGroupIds]
        );
        optionsRows = optsRes.rows;
      }

      const uniqueOptionIds = Array.from(new Set(item.optionIds));
      if (uniqueOptionIds.length !== item.optionIds.length) {
        throw new AppError(400, 'INVALID_MODIFIERS', 'Дублирующиеся модификаторы в позиции');
      }

      const selectedSet = new Set(uniqueOptionIds);
      // Все выбранные варианты должны принадлежать привязанным группам товара и быть доступны
      for (const optId of uniqueOptionIds) {
        const opt = optionsRows.find((o) => o.id === optId);
        if (!opt) {
          throw new AppError(
            400,
            'INVALID_MODIFIERS',
            `Недопустимый модификатор для товара «${prod.name}»`
          );
        }
        if (!opt.is_available) {
          throw new AppError(
            409,
            'MODIFIER_UNAVAILABLE',
            `Модификатор «${opt.name}» временно недоступен`
          );
        }
      }

      const itemModifiers: OrderModifierSnapshot[] = [];
      let modifiersDelta = 0;

      for (const grp of groupsRes.rows) {
        const chosenInGrp = optionsRows.filter(
          (o) => o.group_id === grp.id && selectedSet.has(o.id)
        );
        if (grp.is_required && chosenInGrp.length === 0) {
          throw new AppError(
            400,
            'REQUIRED_MODIFIER_MISSING',
            `Выберите обязательный параметр «${grp.name}» для «${prod.name}»`
          );
        }
        if (grp.select_type === 'single' && chosenInGrp.length > 1) {
          throw new AppError(
            400,
            'SINGLE_MODIFIER_VIOLATION',
            `В группе «${grp.name}» можно выбрать только один вариант`
          );
        }

        for (const chosen of chosenInGrp) {
          itemModifiers.push({
            groupName: grp.name,
            optionName: chosen.name,
            priceDelta: chosen.price_delta,
          });
          modifiersDelta += chosen.price_delta;
        }
      }

      const unitPrice = prod.base_price + modifiersDelta;
      const lineTotal = unitPrice * item.quantity;
      orderTotal += lineTotal;

      preparedItems.push({
        productId: prod.id,
        productName: prod.name,
        unitPrice,
        modifiers: itemModifiers,
        quantity: item.quantity,
        lineTotal,
      });
    }

    const generatedAccessKey = crypto.randomBytes(24).toString('hex'); // 48 символов (>= 32)
    const userId = actor?.role === 'client' ? actor.id : null;

    // Номер генерируется случайно; при крайне маловероятном совпадении пробуем другой
    let orderId: number;
    for (let attempt = 0; ; attempt++) {
      const orderNumber = generateOrderNumber();
      await tx.query('SAVEPOINT order_number_retry');
      try {
        const orderIns = await tx.query<{ id: number }>(
          `INSERT INTO coffee_orders (
             number, access_key, idempotency_key, point_id, user_id,
             customer_name, customer_phone, comment,
             pickup_at, is_asap, pickup_time_adjusted, total, requires_call, status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, $11, $12, 'new')
           RETURNING id`,
          [
            orderNumber,
            generatedAccessKey,
            idempotencyKey,
            point.id,
            userId,
            customerName,
            customerPhone,
            comment,
            selectedPickupIso,
            input.isAsap,
            orderTotal,
            callConfirmThreshold > 0 && orderTotal > callConfirmThreshold,
          ]
        );
        orderId = orderIns.rows[0].id;
        break;
      } catch (err: any) {
        const isNumberCollision =
          err?.constraint === 'coffee_orders_number_unique' ||
          /coffee_orders_number_unique/.test(err?.message ?? '');
        if (isNumberCollision && attempt < 5) {
          await tx.query('ROLLBACK TO SAVEPOINT order_number_retry');
          continue;
        }
        throw err;
      }
    }

    for (const pItem of preparedItems) {
      await tx.query(
        `INSERT INTO coffee_order_items (
           order_id, product_id, product_name, unit_price, modifiers, quantity, line_total
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
        [
          orderId,
          pItem.productId,
          pItem.productName,
          pItem.unitPrice,
          JSON.stringify(pItem.modifiers),
          pItem.quantity,
          pItem.lineTotal,
        ]
      );
    }

    await tx.query(
      `INSERT INTO coffee_order_status_history (
         order_id, from_status, to_status, actor_user_id, actor_role
       )
       VALUES ($1, NULL, 'new', $2, $3)`,
      [orderId, userId, userId ? 'client' : 'guest']
    );

    return generatedAccessKey;
  });

  return (await getOrderByAccessKeyForGuest(accessKey))!;
}

async function fetchOrderItems(orderIds: number[]): Promise<Map<number, OrderItemDto[]>> {
  const map = new Map<number, OrderItemDto[]>();
  if (orderIds.length === 0) return map;

  const res = await query<{
    id: number;
    order_id: number;
    product_id: number | null;
    product_name: string;
    unit_price: number;
    modifiers: OrderModifierSnapshot[] | string;
    quantity: number;
    line_total: number;
  }>(
    `SELECT id, order_id, product_id, product_name, unit_price, modifiers, quantity, line_total
     FROM coffee_order_items
     WHERE order_id = ANY($1::int[])
     ORDER BY id ASC`,
    [orderIds]
  );

  for (const row of res.rows) {
    const mods: OrderModifierSnapshot[] =
      typeof row.modifiers === 'string'
        ? JSON.parse(row.modifiers)
        : row.modifiers ?? [];
    const list = map.get(row.order_id) ?? [];
    list.push({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      unitPrice: row.unit_price,
      modifiers: mods,
      quantity: row.quantity,
      lineTotal: row.line_total,
    });
    map.set(row.order_id, list);
  }

  return map;
}

export async function getOrderByAccessKeyForGuest(
  accessKey: string
): Promise<GuestOrderDto | null> {
  if (!accessKey || accessKey.length < 16) return null;

  const res = await query<{
    id: number;
    number: string;
    access_key: string;
    point_id: number;
    point_name: string;
    point_address: string;
    point_phone: string;
    user_id: number | null;
    customer_name: string;
    customer_phone: string;
    comment: string;
    pickup_at: string;
    is_asap: boolean;
    pickup_time_adjusted: boolean;
    requires_call?: boolean;
    call_confirmed_at?: string | null;
    total: number;
    status: OrderStatus;
    created_at: string;
  }>(
    `SELECT o.id, o.number, o.access_key, o.point_id,
            p.name AS point_name, p.address AS point_address, p.phone AS point_phone,
            o.user_id, o.customer_name, o.customer_phone, o.comment,
            o.pickup_at, o.is_asap, o.pickup_time_adjusted, o.total, o.requires_call, o.call_confirmed_at, o.status, o.created_at
     FROM coffee_orders o
     JOIN points p ON p.id = o.point_id
     WHERE o.access_key = $1`,
    [accessKey]
  );

  if (res.rowCount === 0) return null;
  const row = res.rows[0];

  const itemsMap = await fetchOrderItems([row.id]);
  let cancelReasonLabel: string | null = null;

  if (row.status === 'cancelled') {
    const histRes = await query<{
      cancel_reason: string | null;
      cancel_comment: string | null;
    }>(
      `SELECT cancel_reason, cancel_comment
       FROM coffee_order_status_history
       WHERE order_id = $1 AND to_status = 'cancelled'
       ORDER BY id DESC
       LIMIT 1`,
      [row.id]
    );
    if (histRes.rowCount > 0) {
      cancelReasonLabel = formatCancelReason(
        histRes.rows[0].cancel_reason,
        histRes.rows[0].cancel_comment
      );
    }
  }

  return {
    number: row.number,
    accessKey: row.access_key,
    pointId: row.point_id,
    pointName: row.point_name,
    pointAddress: row.point_address,
    pointPhone: row.point_phone,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    comment: row.comment,
    pickupAt: new Date(row.pickup_at).toISOString(),
    pickupTimeFormatted: formatMiassTime(row.pickup_at),
    isAsap: row.is_asap,
    pickupTimeAdjusted: row.pickup_time_adjusted,
    total: row.total,
    requiresCall: Boolean(row.requires_call),
    status: row.status,
    statusLabel: ORDER_STATUS_LABELS[row.status],
    cancelReasonLabel,
    isLinkedToProfile: row.user_id !== null,
    createdAt: new Date(row.created_at).toISOString(),
    items: itemsMap.get(row.id) ?? [],
  };
}

export async function cancelOrderByGuest(
  accessKey: string,
  actorUserId: number | null = null
): Promise<GuestOrderDto> {
  await transaction(async (tx) => {
    const existing = await tx.query<{ id: number; status: OrderStatus }>(
      'SELECT id, status FROM coffee_orders WHERE access_key = $1',
      [accessKey]
    );

    if (existing.rowCount === 0) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
    }

    const order = existing.rows[0];
    const upd = await tx.query(
      `UPDATE coffee_orders
       SET status = 'cancelled'
       WHERE id = $1 AND status = 'new'`,
      [order.id]
    );

    if (upd.rowCount === 0) {
      const current = await tx.query<{ status: OrderStatus }>(
        'SELECT status FROM coffee_orders WHERE id = $1',
        [order.id]
      );
      throw new AppError(
        409,
        'ORDER_ALREADY_UPDATED',
        'Заказ уже обновлён (отмена возможна только в статусе «Новый»)',
        { currentStatus: current.rows[0]?.status ?? order.status }
      );
    }

    await tx.query(
      `INSERT INTO coffee_order_status_history (
         order_id, from_status, to_status, actor_user_id, actor_role, cancel_reason
       )
       VALUES ($1, 'new', 'cancelled', $2, $3, 'guest_self')`,
      [order.id, actorUserId, actorUserId ? 'client' : 'guest']
    );
  });

  return (await getOrderByAccessKeyForGuest(accessKey))!;
}

export interface StaffTransitionInput {
  orderId: number;
  expectedFromStatus: OrderStatus;
  toStatus: OrderStatus;
  shiftMinutes?: 0 | 5 | 10 | 15;
  cancelReason?: string;
  cancelComment?: string;
  /** Сотрудник отметил «Звонок сделан» при принятии заказа, требующего звонка */
  callConfirmed?: boolean;
}

export async function transitionOrderStatusByStaff(
  input: StaffTransitionInput,
  actor: SessionUser
): Promise<StaffOrderDto> {
  if (actor.role !== 'barista' && actor.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Нет доступа');
  }

  await transaction(async (tx) => {
    const orderRes = await tx.query<{
      id: number;
      point_id: number;
      status: OrderStatus;
      pickup_at: string;
      total: number;
      requires_call: boolean;
      call_confirmed_at: string | null;
    }>(
      'SELECT id, point_id, status, pickup_at, total, requires_call, call_confirmed_at FROM coffee_orders WHERE id = $1',
      [input.orderId]
    );

    if (orderRes.rowCount === 0) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
    }

    const order = orderRes.rows[0];
    if (actor.role === 'barista' && order.point_id !== actor.pointId) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
    }

    // Проверка допустимости перехода по правилам 5.1
    const from = input.expectedFromStatus;
    const to = input.toStatus;

    if (to === 'cancelled') {
      const cancellable: OrderStatus[] = ['new', 'accepted', 'cooking', 'ready'];
      if (!cancellable.includes(from)) {
        throw new AppError(
          409,
          'INVALID_STATUS_TRANSITION',
          'Этот заказ уже нельзя отменить'
        );
      }
      if (!input.cancelReason || !STAFF_CANCEL_REASONS[input.cancelReason]) {
        throw new AppError(400, 'CANCEL_REASON_REQUIRED', 'Укажите причину отмены', {
          cancelReason: 'Выберите причину отмены',
        });
      }
      if (input.cancelReason === 'other' && !input.cancelComment?.trim()) {
        throw new AppError(
          400,
          'CANCEL_COMMENT_REQUIRED',
          'Для причины «Другое» укажите пояснение',
          { cancelComment: 'Введите причину отмены' }
        );
      }
    } else {
      const allowedNext = ALLOWED_NEXT_STATUS[from];
      if (allowedNext !== to) {
        throw new AppError(
          409,
          'INVALID_STATUS_TRANSITION',
          `Недопустимый переход из статуса «${ORDER_STATUS_LABELS[from]}» в «${ORDER_STATUS_LABELS[to]}»`
        );
      }
    }

    // Крупный заказ принимается только после звонка гостю (п. 4.4 ТЗ)
    const confirmsCallNow =
      from === 'new' && to === 'accepted' && order.requires_call && !order.call_confirmed_at;
    if (confirmsCallNow && input.callConfirmed !== true) {
      throw new AppError(
        409,
        'CALL_CONFIRMATION_REQUIRED',
        `Заказ на ${order.total} ₽: позвоните гостю и отметьте «Звонок сделан», затем примите заказ`
      );
    }

    let newPickupAt = new Date(order.pickup_at).toISOString();
    let adjustedFlag: boolean | null = null;

    if (from === 'new' && to === 'accepted' && input.shiftMinutes && input.shiftMinutes > 0) {
      if (![5, 10, 15].includes(input.shiftMinutes)) {
        throw new AppError(400, 'INVALID_SHIFT', 'Допустимый сдвиг времени: +5, +10 или +15 минут');
      }
      newPickupAt = new Date(
        new Date(order.pickup_at).getTime() + input.shiftMinutes * 60_000
      ).toISOString();
      adjustedFlag = true;
    }

    const upd = await tx.query(
      `UPDATE coffee_orders
       SET status = $1,
           pickup_at = $2,
           pickup_time_adjusted = COALESCE($3, pickup_time_adjusted),
           call_confirmed_at = CASE WHEN $6::boolean THEN NOW() ELSE call_confirmed_at END,
           call_confirmed_by = CASE WHEN $6::boolean THEN $7::integer ELSE call_confirmed_by END
       WHERE id = $4 AND status = $5`,
      [to, newPickupAt, adjustedFlag, order.id, from, confirmsCallNow, actor.id]
    );

    if (upd.rowCount === 0) {
      const currentRes = await tx.query<{ status: OrderStatus }>(
        'SELECT status FROM coffee_orders WHERE id = $1',
        [order.id]
      );
      const currentStatus = currentRes.rows[0]?.status ?? order.status;
      throw new AppError(
        409,
        'ORDER_ALREADY_UPDATED',
        'Заказ уже обновлён',
        { currentStatus }
      );
    }

    await tx.query(
      `INSERT INTO coffee_order_status_history (
         order_id, from_status, to_status, actor_user_id, actor_role, cancel_reason, cancel_comment
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        order.id,
        from,
        to,
        actor.id,
        actor.role,
        to === 'cancelled' ? input.cancelReason ?? null : null,
        to === 'cancelled' ? input.cancelComment?.trim() || null : null,
      ]
    );
  });

  return (await getStaffOrderById(input.orderId, actor))!;
}

async function hydrateStaffOrders(
  rows: Array<{
    id: number;
    number: string;
    access_key: string;
    point_id: number;
    point_name: string;
    point_address: string;
    customer_name: string;
    customer_phone: string;
    comment: string;
    pickup_at: string;
    is_asap: boolean;
    pickup_time_adjusted: boolean;
    requires_call?: boolean;
    call_confirmed_at?: string | null;
    total: number;
    status: OrderStatus;
    created_at: string;
  }>,
  includeHistory = false
): Promise<StaffOrderDto[]> {
  if (rows.length === 0) return [];

  const orderIds = rows.map((r) => r.id);
  const itemsMap = await fetchOrderItems(orderIds);

  const uniquePhones = Array.from(new Set(rows.map((r) => r.customer_phone)));
  const noShowByPhone = new Map<string, number>();

  const cfg = getConfig();
  if (cfg.enableNoShowCounter && uniquePhones.length > 0) {
    const nsRes = await query<{ customer_phone: string; cnt: string }>(
      `SELECT o.customer_phone, COUNT(DISTINCT o.id)::text AS cnt
       FROM coffee_orders o
       JOIN coffee_order_status_history h ON h.order_id = o.id
       WHERE o.customer_phone = ANY($1::text[])
         AND o.status = 'cancelled'
         AND h.to_status = 'cancelled'
         AND h.cancel_reason = 'no_show'
       GROUP BY o.customer_phone`,
      [uniquePhones]
    );
    for (const r of nsRes.rows) {
      noShowByPhone.set(r.customer_phone, Number(r.cnt));
    }
  }

  const cancelInfoByOrder = new Map<number, string | null>();
  const historyByOrder = new Map<number, OrderHistoryEntryDto[]>();

  const histRes = await query<{
    id: number;
    order_id: number;
    from_status: OrderStatus | null;
    to_status: OrderStatus;
    actor_user_id: number | null;
    actor_name: string | null;
    actor_role: string;
    cancel_reason: string | null;
    cancel_comment: string | null;
    created_at: string;
  }>(
    `SELECT h.id, h.order_id, h.from_status, h.to_status, h.actor_user_id,
            u.name AS actor_name, h.actor_role, h.cancel_reason, h.cancel_comment, h.created_at
     FROM coffee_order_status_history h
     LEFT JOIN users u ON u.id = h.actor_user_id
     WHERE h.order_id = ANY($1::int[])
     ORDER BY h.id ASC`,
    [orderIds]
  );

  for (const h of histRes.rows) {
    const cancelReasonLabel = formatCancelReason(h.cancel_reason, h.cancel_comment);
    if (h.to_status === 'cancelled') {
      cancelInfoByOrder.set(h.order_id, cancelReasonLabel);
    }
    if (includeHistory) {
      const list = historyByOrder.get(h.order_id) ?? [];
      list.push({
        id: h.id,
        fromStatus: h.from_status,
        toStatus: h.to_status,
        actorUserId: h.actor_user_id,
        actorName: h.actor_name,
        actorRole: h.actor_role,
        cancelReason: h.cancel_reason,
        cancelReasonLabel,
        cancelComment: h.cancel_comment,
        createdAt: new Date(h.created_at).toISOString(),
      });
      historyByOrder.set(h.order_id, list);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    accessKey: r.access_key,
    pointId: r.point_id,
    pointName: r.point_name,
    pointAddress: r.point_address,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    comment: r.comment,
    pickupAt: new Date(r.pickup_at).toISOString(),
    pickupTimeFormatted: formatMiassTime(r.pickup_at),
    isAsap: r.is_asap,
    pickupTimeAdjusted: r.pickup_time_adjusted,
    total: r.total,
    requiresCall: Boolean(r.requires_call),
    callConfirmedAt: r.call_confirmed_at ? new Date(r.call_confirmed_at).toISOString() : null,
    status: r.status,
    statusLabel: ORDER_STATUS_LABELS[r.status],
    noShowCount: noShowByPhone.get(r.customer_phone) ?? 0,
    cancelReasonLabel: cancelInfoByOrder.get(r.id) ?? null,
    createdAt: new Date(r.created_at).toISOString(),
    items: itemsMap.get(r.id) ?? [],
    ...(includeHistory ? { history: historyByOrder.get(r.id) ?? [] } : {}),
  }));
}

export async function getStaffOrderById(
  orderId: number,
  actor: SessionUser
): Promise<StaffOrderDto | null> {
  if (actor.role !== 'barista' && actor.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Нет доступа');
  }

  const res = await query<{
    id: number;
    number: string;
    access_key: string;
    point_id: number;
    point_name: string;
    point_address: string;
    customer_name: string;
    customer_phone: string;
    comment: string;
    pickup_at: string;
    is_asap: boolean;
    pickup_time_adjusted: boolean;
    requires_call?: boolean;
    call_confirmed_at?: string | null;
    total: number;
    status: OrderStatus;
    created_at: string;
  }>(
    `SELECT o.id, o.number, o.access_key, o.point_id,
            p.name AS point_name, p.address AS point_address,
            o.customer_name, o.customer_phone, o.comment,
            o.pickup_at, o.is_asap, o.pickup_time_adjusted, o.total, o.requires_call, o.call_confirmed_at, o.status, o.created_at
     FROM coffee_orders o
     JOIN points p ON p.id = o.point_id
     WHERE o.id = $1`,
    [orderId]
  );

  if (res.rowCount === 0) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
  }

  const row = res.rows[0];
  if (actor.role === 'barista' && row.point_id !== actor.pointId) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
  }

  const list = await hydrateStaffOrders([row], true);
  return list[0] ?? null;
}

export async function listBaristaQueue(
  actor: SessionUser,
  now: Date = new Date()
): Promise<{
  pointId: number;
  pointName: string;
  activeOrders: StaffOrderDto[];
  completedTodayOrders: StaffOrderDto[];
  counts: Record<string, number>;
}> {
  if (actor.role !== 'barista' && actor.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Нет доступа');
  }
  let pointId = actor.pointId;
  let pointName = actor.pointName ?? 'Точка СТАНЦИЯ';

  if (!pointId && actor.role === 'admin') {
    const firstPt = await query<{ id: number; name: string }>(
      'SELECT id, name FROM points ORDER BY id ASC LIMIT 1'
    );
    if (firstPt.rowCount > 0) {
      pointId = firstPt.rows[0].id;
      pointName = firstPt.rows[0].name;
    }
  }

  if (!pointId) {
    throw new AppError(403, 'BARISTA_NO_POINT', 'Вам не назначена точка');
  }
  const { start, end } = getMiassDayBounds(undefined, now);

  const activeRes = await query<{
    id: number;
    number: string;
    access_key: string;
    point_id: number;
    point_name: string;
    point_address: string;
    customer_name: string;
    customer_phone: string;
    comment: string;
    pickup_at: string;
    is_asap: boolean;
    pickup_time_adjusted: boolean;
    requires_call?: boolean;
    call_confirmed_at?: string | null;
    total: number;
    status: OrderStatus;
    created_at: string;
  }>(
    `SELECT o.id, o.number, o.access_key, o.point_id,
            p.name AS point_name, p.address AS point_address,
            o.customer_name, o.customer_phone, o.comment,
            o.pickup_at, o.is_asap, o.pickup_time_adjusted, o.total, o.requires_call, o.call_confirmed_at, o.status, o.created_at
     FROM coffee_orders o
     JOIN points p ON p.id = o.point_id
     WHERE o.point_id = $1
       AND o.status IN ('new', 'accepted', 'cooking', 'ready')
     ORDER BY o.pickup_at ASC, o.id ASC`,
    [pointId]
  );

  const completedRes = await query<{
    id: number;
    number: string;
    access_key: string;
    point_id: number;
    point_name: string;
    point_address: string;
    customer_name: string;
    customer_phone: string;
    comment: string;
    pickup_at: string;
    is_asap: boolean;
    pickup_time_adjusted: boolean;
    requires_call?: boolean;
    call_confirmed_at?: string | null;
    total: number;
    status: OrderStatus;
    created_at: string;
  }>(
    `SELECT o.id, o.number, o.access_key, o.point_id,
            p.name AS point_name, p.address AS point_address,
            o.customer_name, o.customer_phone, o.comment,
            o.pickup_at, o.is_asap, o.pickup_time_adjusted, o.total, o.requires_call, o.call_confirmed_at, o.status, o.created_at
     FROM coffee_orders o
     JOIN points p ON p.id = o.point_id
     WHERE o.point_id = $1
       AND o.status IN ('done', 'cancelled')
       AND o.created_at >= $2 AND o.created_at <= $3
     ORDER BY o.id DESC`,
    [pointId, start.toISOString(), end.toISOString()]
  );

  const [activeOrders, completedTodayOrders] = await Promise.all([
    hydrateStaffOrders(activeRes.rows, false),
    hydrateStaffOrders(completedRes.rows, false),
  ]);

  const counts: Record<string, number> = {
    active: activeOrders.length,
    new: activeOrders.filter((o) => o.status === 'new').length,
    accepted: activeOrders.filter((o) => o.status === 'accepted').length,
    cooking: activeOrders.filter((o) => o.status === 'cooking').length,
    ready: activeOrders.filter((o) => o.status === 'ready').length,
    completed: completedTodayOrders.length,
  };

  return {
    pointId,
    pointName,
    activeOrders,
    completedTodayOrders,
    counts,
  };
}

export async function listClientOrders(userId: number): Promise<GuestOrderDto[]> {
  const res = await query<{
    id: number;
    number: string;
    access_key: string;
    point_id: number;
    point_name: string;
    point_address: string;
    point_phone: string;
    user_id: number | null;
    customer_name: string;
    customer_phone: string;
    comment: string;
    pickup_at: string;
    is_asap: boolean;
    pickup_time_adjusted: boolean;
    requires_call?: boolean;
    call_confirmed_at?: string | null;
    total: number;
    status: OrderStatus;
    created_at: string;
  }>(
    `SELECT o.id, o.number, o.access_key, o.point_id,
            p.name AS point_name, p.address AS point_address, p.phone AS point_phone,
            o.user_id, o.customer_name, o.customer_phone, o.comment,
            o.pickup_at, o.is_asap, o.pickup_time_adjusted, o.total, o.requires_call, o.call_confirmed_at, o.status, o.created_at
     FROM coffee_orders o
     JOIN points p ON p.id = o.point_id
     WHERE o.user_id = $1
     ORDER BY
       CASE WHEN o.status IN ('new', 'accepted', 'cooking', 'ready') THEN 0 ELSE 1 END ASC,
       o.created_at DESC`,
    [userId]
  );

  if (res.rowCount === 0) return [];
  const itemsMap = await fetchOrderItems(res.rows.map((r) => r.id));

  return res.rows.map((row) => ({
    number: row.number,
    accessKey: row.access_key,
    pointId: row.point_id,
    pointName: row.point_name,
    pointAddress: row.point_address,
    pointPhone: row.point_phone,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    comment: row.comment,
    pickupAt: new Date(row.pickup_at).toISOString(),
    pickupTimeFormatted: formatMiassTime(row.pickup_at),
    isAsap: row.is_asap,
    pickupTimeAdjusted: row.pickup_time_adjusted,
    total: row.total,
    requiresCall: Boolean(row.requires_call),
    status: row.status,
    statusLabel: ORDER_STATUS_LABELS[row.status],
    cancelReasonLabel: null,
    isLinkedToProfile: true,
    createdAt: new Date(row.created_at).toISOString(),
    items: itemsMap.get(row.id) ?? [],
  }));
}

export async function attachGuestOrderToUserByAccessKey(
  accessKey: string,
  userId: number
): Promise<void> {
  if (!accessKey) return;
  await query(
    `UPDATE coffee_orders
     SET user_id = $1
     WHERE access_key = $2 AND user_id IS NULL`,
    [userId, accessKey]
  );
}

export interface AdminOrdersFilter {
  pointId?: number | null;
  status?: string | null;
  period?: 'today' | '7d' | '30d' | 'all' | 'custom';
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listAdminOrders(
  filter: AdminOrdersFilter,
  now: Date = new Date()
): Promise<{
  orders: StaffOrderDto[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.pointId) {
    params.push(filter.pointId);
    conditions.push(`o.point_id = $${params.length}`);
  }

  if (filter.status && filter.status !== 'all') {
    params.push(filter.status);
    conditions.push(`o.status = $${params.length}`);
  }

  const period = filter.period || 'today';
  if (period === 'today') {
    const { start, end } = getMiassDayBounds(undefined, now);
    params.push(start.toISOString(), end.toISOString());
    conditions.push(`o.created_at >= $${params.length - 1} AND o.created_at <= $${params.length}`);
  } else if (period === '7d') {
    const { end } = getMiassDayBounds(undefined, now);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    params.push(start.toISOString(), end.toISOString());
    conditions.push(`o.created_at >= $${params.length - 1} AND o.created_at <= $${params.length}`);
  } else if (period === '30d') {
    const { end } = getMiassDayBounds(undefined, now);
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    params.push(start.toISOString(), end.toISOString());
    conditions.push(`o.created_at >= $${params.length - 1} AND o.created_at <= $${params.length}`);
  } else if (period === 'custom') {
    if (filter.from) {
      const { start } = getMiassDayBounds(filter.from, now);
      params.push(start.toISOString());
      conditions.push(`o.created_at >= $${params.length}`);
    }
    if (filter.to) {
      const { end } = getMiassDayBounds(filter.to, now);
      params.push(end.toISOString());
      conditions.push(`o.created_at <= $${params.length}`);
    }
  }

  if (filter.search?.trim()) {
    const s = filter.search.trim();
    params.push(`%${s}%`);
    conditions.push(
      `(o.number::text ILIKE $${params.length} OR o.customer_phone ILIKE $${params.length} OR o.customer_name ILIKE $${params.length})`
    );
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = Math.max(1, filter.page || 1);
  const pageSize = Math.min(100, Math.max(5, filter.pageSize || 20));
  const offset = (page - 1) * pageSize;

  const countRes = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM coffee_orders o ${whereSql}`,
    params
  );
  const totalCount = Number(countRes.rows[0]?.cnt ?? 0);

  const listParams = [...params, pageSize, offset];
  const rowsRes = await query<{
    id: number;
    number: string;
    access_key: string;
    point_id: number;
    point_name: string;
    point_address: string;
    customer_name: string;
    customer_phone: string;
    comment: string;
    pickup_at: string;
    is_asap: boolean;
    pickup_time_adjusted: boolean;
    requires_call?: boolean;
    call_confirmed_at?: string | null;
    total: number;
    status: OrderStatus;
    created_at: string;
  }>(
    `SELECT o.id, o.number, o.access_key, o.point_id,
            p.name AS point_name, p.address AS point_address,
            o.customer_name, o.customer_phone, o.comment,
            o.pickup_at, o.is_asap, o.pickup_time_adjusted, o.total, o.requires_call, o.call_confirmed_at, o.status, o.created_at
     FROM coffee_orders o
     JOIN points p ON p.id = o.point_id
     ${whereSql}
     ORDER BY o.id DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  const orders = await hydrateStaffOrders(rowsRes.rows, true);

  return {
    orders,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

/** Статистика заказов по зарегистрированным клиентам для раздела «Гости» в админке. */
export async function getCoffeeClientOrderStats(
  userIds: number[]
): Promise<Map<number, { ordersCount: number; doneCount: number; doneSum: number; lastOrderAt: string | null }>> {
  const map = new Map<number, { ordersCount: number; doneCount: number; doneSum: number; lastOrderAt: string | null }>();
  if (userIds.length === 0) return map;
  const res = await query<{
    user_id: number;
    orders_count: number;
    done_count: number;
    done_sum: number;
    last_order_at: string | null;
  }>(
    `SELECT user_id,
            COUNT(*)::int AS orders_count,
            COUNT(*) FILTER (WHERE status = 'done')::int AS done_count,
            COALESCE(SUM(total) FILTER (WHERE status = 'done'), 0)::int AS done_sum,
            MAX(created_at) AS last_order_at
     FROM coffee_orders
     WHERE user_id = ANY($1::int[])
     GROUP BY user_id`,
    [userIds]
  );
  for (const r of res.rows) {
    map.set(r.user_id, {
      ordersCount: r.orders_count,
      doneCount: r.done_count,
      doneSum: r.done_sum,
      lastOrderAt: r.last_order_at ? new Date(r.last_order_at).toISOString() : null,
    });
  }
  return map;
}
