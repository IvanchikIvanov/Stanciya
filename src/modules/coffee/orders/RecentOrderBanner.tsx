'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  forgetRecentOrder,
  useRecentOrders,
} from '@/modules/coffee/orders/recent-orders-store';
import type { OrderStatus } from '@/modules/coffee/orders/service';

interface BannerOrder {
  accessKey: string;
  number: string;
  status: OrderStatus;
  statusLabel: string;
}

const ACTIVE_STATUSES: OrderStatus[] = ['new', 'accepted', 'cooking', 'ready'];

/**
 * Плашка «Ваш заказ №…» для гостя: показывает сохранённые на этом устройстве
 * активные заказы и ведёт на страницу статуса. Завершённые и отменённые не показывает.
 */
export function RecentOrderBanner() {
  const { orders, hydrated } = useRecentOrders();
  const [active, setActive] = useState<BannerOrder[]>([]);

  const refresh = useCallback(async () => {
    const recent = orders;
    if (recent.length === 0) {
      setActive([]);
      return;
    }
    const results = await Promise.all(
      recent.map(async (o) => {
        try {
          const res = await fetch(`/api/coffee/orders/${encodeURIComponent(o.accessKey)}`, {
            cache: 'no-store',
          });
          if (res.status === 404) {
            forgetRecentOrder(o.accessKey);
            return null;
          }
          if (!res.ok) return null;
          const data = await res.json();
          const ord = data.order as BannerOrder;
          if (!ACTIVE_STATUSES.includes(ord.status)) return null;
          return {
            accessKey: o.accessKey,
            number: ord.number,
            status: ord.status,
            statusLabel: ord.statusLabel,
          };
        } catch {
          return null;
        }
      })
    );
    setActive(results.filter((r): r is BannerOrder => r !== null));
  }, [orders]);

  useEffect(() => {
    if (!hydrated) return;
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [hydrated, refresh]);

  if (!hydrated || active.length === 0) return null;

  return (
    <div className="space-y-2" role="status" aria-label="Ваши активные заказы">
      {active.map((ord) => (
        <div
          key={ord.accessKey}
          className="rounded-card border border-brand/25 bg-brand-light px-4 py-3 flex items-center justify-between gap-3"
        >
          <Link
            href={`/order/${ord.accessKey}`}
            className="flex items-center gap-2.5 flex-wrap min-w-0 text-sm font-bold text-slate-900 hover:text-brand transition"
          >
            <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-brand shrink-0" aria-hidden="true" />
            <span>
              Ваш заказ №{ord.number} · {ord.statusLabel}
            </span>
            <span className="text-brand underline underline-offset-2">
              {ord.status === 'ready' ? 'Забрать →' : 'Следить →'}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => forgetRecentOrder(ord.accessKey)}
            aria-label={`Скрыть заказ №${ord.number}`}
            title="Скрыть"
            className="shrink-0 w-7 h-7 rounded-full text-slate-500 hover:bg-white hover:text-slate-800 font-bold transition"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
