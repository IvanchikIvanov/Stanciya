'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Последние заказы гостя в LocalStorage: чтобы после ухода в каталог
 * можно было вернуться на страницу заказа без длинной ссылки.
 * Ключ заказа — секретный токен, поэтому храним только на устройстве гостя.
 */
export interface RecentOrder {
  accessKey: string;
  number: string;
  createdAt: string; // ISO-дата оформления
}

const RECENT_ORDERS_KEY = 'stanciya_recent_orders_v2';
const RECENT_ORDERS_EVENT = 'stanciya-recent-orders-updated';
const MAX_RECENT_ORDERS = 5;
// Заказы оформляются на текущий день — старше суток записи не нужны
const RECENT_ORDER_TTL_MS = 24 * 60 * 60 * 1000;

function isValidRecentOrder(value: unknown): value is RecentOrder {
  const v = value as RecentOrder;
  return (
    Boolean(v) &&
    typeof v.accessKey === 'string' &&
    v.accessKey.length >= 16 &&
    typeof v.number === 'string' &&
    v.number.length > 0 &&
    typeof v.createdAt === 'string' &&
    !Number.isNaN(Date.parse(v.createdAt))
  );
}

export function readRecentOrders(): RecentOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter(isValidRecentOrder)
      .filter((o) => now - Date.parse(o.createdAt) < RECENT_ORDER_TTL_MS)
      .slice(0, MAX_RECENT_ORDERS);
  } catch {
    return [];
  }
}

function writeRecentOrders(orders: RecentOrder[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_ORDERS_KEY, JSON.stringify(orders));
    window.dispatchEvent(new CustomEvent(RECENT_ORDERS_EVENT));
  } catch {
    // ignore storage quota errors
  }
}

/** Запоминает заказ (идемпотентно: повторный вызов с тем же ключом ничего не меняет). */
export function rememberRecentOrder(order: { accessKey: string; number: string }): void {
  if (typeof window === 'undefined') return;
  if (!order.accessKey || !order.number) return;
  const current = readRecentOrders();
  if (current[0]?.accessKey === order.accessKey) return;
  const rest = current.filter((o) => o.accessKey !== order.accessKey);
  const next: RecentOrder[] = [
    { accessKey: order.accessKey, number: order.number, createdAt: new Date().toISOString() },
    ...rest,
  ].slice(0, MAX_RECENT_ORDERS);
  writeRecentOrders(next);
}

export function forgetRecentOrder(accessKey: string): void {
  if (typeof window === 'undefined') return;
  const current = readRecentOrders();
  const next = current.filter((o) => o.accessKey !== accessKey);
  if (next.length !== current.length) writeRecentOrders(next);
}

export function useRecentOrders(): { orders: RecentOrder[]; hydrated: boolean } {
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const sync = useCallback(() => {
    setOrders(readRecentOrders());
    setHydrated(true);
  }, []);

  useEffect(() => {
    sync();
    const onStorage = () => sync();
    window.addEventListener(RECENT_ORDERS_EVENT, onStorage);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(RECENT_ORDERS_EVENT, onStorage);
      window.removeEventListener('storage', onStorage);
    };
  }, [sync]);

  return { orders, hydrated };
}
