import { query, transaction } from '../db';
import { AppError } from '../errors';
import {
  createMiassTodayDateFromMinutes,
  getMiassDateParts,
  minutesToHhMm,
  parseHhMmToMinutes,
} from '../time';

export interface PointHourDto {
  weekday: number; // 0 (Вс) .. 6 (Сб)
  opensAt: string; // HH:MM
  closesAt: string; // HH:MM
  isClosed: boolean;
}

export interface PointSlotDto {
  time: string; // HH:MM
  iso: string; // ISO string (UTC)
}

export interface PointDto {
  id: number;
  name: string;
  address: string;
  phone: string;
  prepMinutes: number;
  slotStepMinutes: number;
  acceptsOrders: boolean;
  isHidden: boolean;
  services: string[];
  hours: PointHourDto[];
  isOpenNow: boolean;
  closedUntilLabel: string | null;
  hasSlotsToday: boolean;
  asapSlot: PointSlotDto | null;
  slots: PointSlotDto[];
}

export function calculatePointAvailability(
  point: {
    prepMinutes: number;
    slotStepMinutes: number;
    acceptsOrders: boolean;
    isHidden: boolean;
    hours: PointHourDto[];
  },
  now: Date = new Date()
): {
  isOpenNow: boolean;
  closedUntilLabel: string | null;
  hasSlotsToday: boolean;
  asapSlot: PointSlotDto | null;
  slots: PointSlotDto[];
} {
  const miassNow = getMiassDateParts(now);
  const todayHours = point.hours.find((h) => h.weekday === miassNow.weekday);

  const findNextOpeningTimeLabel = (): string | null => {
    for (let offset = 0; offset <= 7; offset++) {
      const wd = (miassNow.weekday + offset) % 7;
      const dayHour = point.hours.find((h) => h.weekday === wd);
      if (!dayHour || dayHour.isClosed) continue;
      const openMin = parseHhMmToMinutes(dayHour.opensAt);
      if (openMin === null) continue;
      if (offset === 0 && openMin <= miassNow.totalMinutes) continue;
      return dayHour.opensAt;
    }
    return null;
  };

  if (!todayHours || todayHours.isClosed || !point.acceptsOrders || point.isHidden) {
    const nextOpen = findNextOpeningTimeLabel();
    return {
      isOpenNow: false,
      closedUntilLabel: nextOpen ? `Закрыто до ${nextOpen}` : 'Закрыто',
      hasSlotsToday: false,
      asapSlot: null,
      slots: [],
    };
  }

  const opensMin = parseHhMmToMinutes(todayHours.opensAt) ?? 480;
  const closesMin = parseHhMmToMinutes(todayHours.closesAt) ?? 1260;

  const isWithinHours =
    miassNow.totalMinutes >= opensMin && miassNow.totalMinutes < closesMin;

  if (!isWithinHours) {
    const nextOpen =
      miassNow.totalMinutes < opensMin
        ? todayHours.opensAt
        : findNextOpeningTimeLabel();
    return {
      isOpenNow: false,
      closedUntilLabel: nextOpen ? `Закрыто до ${nextOpen}` : 'Закрыто',
      hasSlotsToday: false,
      asapSlot: null,
      slots: [],
    };
  }

  const step = Math.max(1, point.slotStepMinutes || 10);
  const prep = Math.max(1, point.prepMinutes || 10);

  // «Как можно скорее» = сейчас + prep_minutes, округлить вверх до шага
  const rawEarliest = miassNow.totalMinutes + prep;
  const firstSlotMin = Math.ceil(rawEarliest / step) * step;

  if (firstSlotMin > closesMin) {
    const nextOpen = findNextOpeningTimeLabel();
    return {
      isOpenNow: true,
      closedUntilLabel: nextOpen ? `Закрыто до ${nextOpen}` : null,
      hasSlotsToday: false,
      asapSlot: null,
      slots: [],
    };
  }

  const slots: PointSlotDto[] = [];
  for (let m = firstSlotMin; m <= closesMin; m += step) {
    const dt = createMiassTodayDateFromMinutes(m, now);
    slots.push({
      time: minutesToHhMm(m),
      iso: dt.toISOString(),
    });
  }

  return {
    isOpenNow: true,
    closedUntilLabel: null,
    hasSlotsToday: slots.length > 0,
    asapSlot: slots[0] ?? null,
    slots,
  };
}

async function hydratePoints(
  rows: Array<{
    id: number;
    name: string;
    address: string;
    phone: string;
    prep_minutes: number;
    slot_step_minutes: number;
    accepts_orders: boolean;
    is_hidden: boolean;
  }>,
  now: Date = new Date()
): Promise<PointDto[]> {
  if (rows.length === 0) return [];

  const hoursRes = await query<{
    point_id: number;
    weekday: number;
    opens_at: string;
    closes_at: string;
    is_closed: boolean;
  }>('SELECT point_id, weekday, opens_at, closes_at, is_closed FROM point_hours ORDER BY weekday ASC');

  const servicesRes = await query<{ point_id: number; service: string }>(
    'SELECT point_id, service FROM point_services'
  );

  return rows.map((r) => {
    const hours: PointHourDto[] = [];
    for (let wd = 0; wd <= 6; wd++) {
      const found = hoursRes.rows.find((h) => h.point_id === r.id && h.weekday === wd);
      hours.push({
        weekday: wd,
        opensAt: found?.opens_at ?? '08:00',
        closesAt: found?.closes_at ?? '21:00',
        isClosed: found?.is_closed ?? false,
      });
    }

    const services = servicesRes.rows
      .filter((s) => s.point_id === r.id)
      .map((s) => s.service);

    const avail = calculatePointAvailability(
      {
        prepMinutes: r.prep_minutes,
        slotStepMinutes: r.slot_step_minutes,
        acceptsOrders: r.accepts_orders,
        isHidden: r.is_hidden,
        hours,
      },
      now
    );

    return {
      id: r.id,
      name: r.name,
      address: r.address,
      phone: r.phone,
      prepMinutes: r.prep_minutes,
      slotStepMinutes: r.slot_step_minutes,
      acceptsOrders: r.accepts_orders,
      isHidden: r.is_hidden,
      services,
      hours,
      ...avail,
    };
  });
}

export async function listPublicPoints(
  service = 'coffee',
  now: Date = new Date()
): Promise<PointDto[]> {
  const res = await query<{
    id: number;
    name: string;
    address: string;
    phone: string;
    prep_minutes: number;
    slot_step_minutes: number;
    accepts_orders: boolean;
    is_hidden: boolean;
  }>(
    `SELECT p.id, p.name, p.address, p.phone, p.prep_minutes, p.slot_step_minutes, p.accepts_orders, p.is_hidden
     FROM points p
     JOIN point_services ps ON ps.point_id = p.id AND ps.service = $1
     WHERE p.is_hidden = FALSE
     ORDER BY p.id ASC`,
    [service]
  );

  return hydratePoints(res.rows, now);
}

export async function getPointById(
  pointId: number,
  now: Date = new Date()
): Promise<PointDto | null> {
  const res = await query<{
    id: number;
    name: string;
    address: string;
    phone: string;
    prep_minutes: number;
    slot_step_minutes: number;
    accepts_orders: boolean;
    is_hidden: boolean;
  }>(
    `SELECT id, name, address, phone, prep_minutes, slot_step_minutes, accepts_orders, is_hidden
     FROM points
     WHERE id = $1`,
    [pointId]
  );
  if (res.rowCount === 0) return null;
  const list = await hydratePoints(res.rows, now);
  return list[0] ?? null;
}

export async function listAdminPoints(now: Date = new Date()): Promise<PointDto[]> {
  const res = await query<{
    id: number;
    name: string;
    address: string;
    phone: string;
    prep_minutes: number;
    slot_step_minutes: number;
    accepts_orders: boolean;
    is_hidden: boolean;
  }>(
    `SELECT id, name, address, phone, prep_minutes, slot_step_minutes, accepts_orders, is_hidden
     FROM points
     ORDER BY id ASC`
  );
  return hydratePoints(res.rows, now);
}

export interface UpsertPointInput {
  name: string;
  address: string;
  phone: string;
  prepMinutes: number;
  slotStepMinutes: number;
  acceptsOrders: boolean;
  isHidden: boolean;
  services?: string[];
  hours: PointHourDto[];
}

function validatePointInput(input: UpsertPointInput): void {
  const fields: Record<string, string> = {};
  if (!input.name || input.name.trim().length < 2) {
    fields.name = 'Укажите название точки';
  }
  if (!input.address || input.address.trim().length < 3) {
    fields.address = 'Укажите адрес точки';
  }
  if (!input.phone || input.phone.trim().length < 5) {
    fields.phone = 'Укажите телефон точки';
  }
  if (!Number.isInteger(input.prepMinutes) || input.prepMinutes < 1 || input.prepMinutes > 180) {
    fields.prepMinutes = 'Время подготовки должно быть от 1 до 180 мин.';
  }
  if (
    !Number.isInteger(input.slotStepMinutes) ||
    input.slotStepMinutes < 5 ||
    input.slotStepMinutes > 60
  ) {
    fields.slotStepMinutes = 'Шаг слотов должен быть от 5 до 60 мин.';
  }

  for (const h of input.hours) {
    if (h.isClosed) continue;
    const openMin = parseHhMmToMinutes(h.opensAt);
    const closeMin = parseHhMmToMinutes(h.closesAt);
    if (openMin === null || closeMin === null) {
      fields.hours = 'Укажите корректное время в формате ЧЧ:ММ';
      break;
    }
    if (closeMin <= openMin) {
      fields.hours = 'Время окончания работы не может быть раньше или равно времени начала';
      break;
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', Object.values(fields)[0], fields);
  }
}

export async function createPoint(input: UpsertPointInput): Promise<PointDto> {
  validatePointInput(input);

  const pointId = await transaction(async (tx) => {
    const ins = await tx.query<{ id: number }>(
      `INSERT INTO points (name, address, phone, prep_minutes, slot_step_minutes, accepts_orders, is_hidden)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.name.trim(),
        input.address.trim(),
        input.phone.trim(),
        input.prepMinutes,
        input.slotStepMinutes,
        input.acceptsOrders,
        input.isHidden,
      ]
    );
    const id = ins.rows[0].id;

    for (let wd = 0; wd <= 6; wd++) {
      const h = input.hours.find((item) => item.weekday === wd) ?? {
        weekday: wd,
        opensAt: '08:00',
        closesAt: '21:00',
        isClosed: false,
      };
      await tx.query(
        `INSERT INTO point_hours (point_id, weekday, opens_at, closes_at, is_closed)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, wd, h.opensAt, h.closesAt, h.isClosed]
      );
    }

    const services = input.services && input.services.length > 0 ? input.services : ['coffee'];
    for (const srv of services) {
      await tx.query(
        `INSERT INTO point_services (point_id, service) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, srv]
      );
    }

    return id;
  });

  return (await getPointById(pointId))!;
}

export async function updatePoint(
  pointId: number,
  input: UpsertPointInput
): Promise<PointDto> {
  validatePointInput(input);

  await transaction(async (tx) => {
    const existing = await tx.query<{ id: number }>(
      'SELECT id FROM points WHERE id = $1',
      [pointId]
    );
    if (existing.rowCount === 0) {
      throw new AppError(404, 'POINT_NOT_FOUND', 'Точка не найдена');
    }

    await tx.query(
      `UPDATE points
       SET name = $1, address = $2, phone = $3, prep_minutes = $4, slot_step_minutes = $5,
           accepts_orders = $6, is_hidden = $7
       WHERE id = $8`,
      [
        input.name.trim(),
        input.address.trim(),
        input.phone.trim(),
        input.prepMinutes,
        input.slotStepMinutes,
        input.acceptsOrders,
        input.isHidden,
        pointId,
      ]
    );

    for (const h of input.hours) {
      await tx.query(
        `INSERT INTO point_hours (point_id, weekday, opens_at, closes_at, is_closed)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (point_id, weekday) DO UPDATE
         SET opens_at = EXCLUDED.opens_at, closes_at = EXCLUDED.closes_at, is_closed = EXCLUDED.is_closed`,
        [pointId, h.weekday, h.opensAt, h.closesAt, h.isClosed]
      );
    }
  });

  return (await getPointById(pointId))!;
}

export async function deletePoint(pointId: number): Promise<void> {
  try {
    const res = await query('DELETE FROM points WHERE id = $1', [pointId]);
    if (res.rowCount === 0) {
      throw new AppError(404, 'POINT_NOT_FOUND', 'Точка не найдена');
    }
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.code === '23503') {
      throw new AppError(
        409,
        'POINT_HAS_ORDERS',
        'Точку с заказами удалить нельзя, только выключить и скрыть'
      );
    }
    throw err;
  }
}
