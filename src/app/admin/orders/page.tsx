'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { formatPhoneDisplay } from '@/core/phone';
import type { PointDto } from '@/core/points/service';
import { formatMiassDateTime } from '@/core/time';
import { CancelOrderModal } from '@/modules/coffee/barista/CancelOrderModal';
import {
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from '@/modules/coffee/orders/constants';
import type { StaffOrderDto } from '@/modules/coffee/orders/service';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<StaffOrderDto[]>([]);
  const [points, setPoints] = useState<PointDto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [pointId, setPointId] = useState<string>('');
  const [status, setStatus] = useState<string>('all');
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'all' | 'custom'>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  const [selectedOrder, setSelectedOrder] = useState<StaffOrderDto | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<StaffOrderDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchOrders = useCallback(
    async (isFirst = false) => {
      if (isFirst) {
        setLoading(true);
        setLoadError(false);
      }
      try {
        const sp = new URLSearchParams();
        if (pointId) sp.set('pointId', pointId);
        if (status && status !== 'all') sp.set('status', status);
        sp.set('period', period);
        if (period === 'custom' && from) sp.set('from', from);
        if (period === 'custom' && to) sp.set('to', to);
        if (search.trim()) sp.set('search', search.trim());
        sp.set('page', String(page));

        const res = await fetch(`/api/coffee/admin/orders?${sp.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('Load error');
        const data = await res.json();
        setOrders(data.orders ?? []);
        setTotalCount(data.totalCount ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setLoadError(false);
        if (selectedOrder) {
          const updated = (data.orders ?? []).find(
            (o: StaffOrderDto) => o.id === selectedOrder.id
          );
          if (updated) setSelectedOrder(updated);
        }
      } catch {
        if (isFirst) setLoadError(true);
      } finally {
        if (isFirst) setLoading(false);
      }
    },
    [pointId, status, period, from, to, search, page, selectedOrder]
  );

  useEffect(() => {
    fetch('/api/core/admin/points', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.points) setPoints(d.points);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchOrders(true);
    const interval = setInterval(() => {
      fetchOrders(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  async function handleTransition(
    ord: StaffOrderDto,
    toStatus: OrderStatus,
    cancelReason?: string,
    cancelComment?: string
  ) {
    setBusyId(ord.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/coffee/barista/orders/${ord.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedFromStatus: ord.status,
          toStatus,
          cancelReason,
          cancelComment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback(data?.error?.message || 'Заказ уже обновлён');
      } else if (data.order) {
        setSelectedOrder(data.order);
      }
      await fetchOrders(false);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Все заказы</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Автообновление каждые 5 секунд · всего найдено: {totalCount}
        </p>
      </div>

      {/* Фильтры и поиск */}
      <div className="bg-white rounded-panel p-4 shadow-card border border-blue-50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
            Точка
          </label>
          <select
            value={pointId}
            onChange={(e) => {
              setPointId(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-btn border border-slate-300 text-sm"
          >
            <option value="">Все точки</option>
            {points.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
            Период
          </label>
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as any);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-btn border border-slate-300 text-sm"
          >
            <option value="today">Сегодня</option>
            <option value="7d">7 дней</option>
            <option value="30d">30 дней</option>
            <option value="all">За всё время</option>
            <option value="custom">Произвольный</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
            Статус
          </label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-btn border border-slate-300 text-sm"
          >
            <option value="all">Все статусы</option>
            {Object.entries(ORDER_STATUS_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
            Поиск по номеру или телефону
          </label>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Например: 1001 или 9001112233"
            className="w-full px-3.5 py-2 rounded-btn border border-slate-300 text-sm"
          />
        </div>

        {period === 'custom' && (
          <div className="sm:col-span-5 flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-600">
              С:{' '}
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="ml-1 px-2.5 py-1.5 rounded border border-slate-300"
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              По:{' '}
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="ml-1 px-2.5 py-1.5 rounded border border-slate-300"
              />
            </label>
          </div>
        )}
      </div>

      {feedback && (
        <div className="p-3.5 rounded-btn bg-amber-50 border border-amber-300 text-amber-900 text-sm font-bold">
          {feedback}
        </div>
      )}

      {/* Таблица заказов */}
      <div className="bg-white rounded-panel p-5 shadow-card border border-blue-50">
        {loading ? (
          <div className="h-64 animate-pulse bg-slate-100 rounded-card" />
        ) : loadError ? (
          <div className="py-10 text-center space-y-3">
            <div className="font-extrabold text-slate-900">Не удалось загрузить</div>
            <button
              type="button"
              onClick={() => fetchOrders(true)}
              className="px-5 py-2.5 rounded-btn bg-brand text-white font-bold text-sm"
            >
              Повторить
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-10 text-center text-slate-600 font-bold text-sm">
            Заказов по выбранным фильтрам не найдено
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2.5 pr-3">№</th>
                  <th className="py-2.5 px-3">Создан / Выдача</th>
                  <th className="py-2.5 px-3">Точка</th>
                  <th className="py-2.5 px-3">Гость</th>
                  <th className="py-2.5 px-3">Сумма</th>
                  <th className="py-2.5 px-3">Статус</th>
                  <th className="py-2.5 pl-3 text-right">Карточка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((ord) => (
                  <tr
                    key={ord.id}
                    onClick={() => setSelectedOrder(ord)}
                    className={`cursor-pointer hover:bg-blue-50/50 transition ${
                      selectedOrder?.id === ord.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="py-3 pr-3 font-extrabold text-slate-900">
                      №{ord.number}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-600">
                      <div>{formatMiassDateTime(ord.createdAt)}</div>
                      <div className="font-bold text-slate-900">
                        Выдача к {ord.pickupTimeFormatted}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-xs font-semibold text-slate-700">
                      {ord.pointName}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 text-xs">
                        {ord.customerName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatPhoneDisplay(ord.customerPhone)}
                      </div>
                      {ord.noShowCount > 0 && (
                        <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-extrabold">
                          Не забрал заказов: {ord.noShowCount}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-extrabold text-slate-900">
                      {ord.total} ₽
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2.5 py-1 rounded-pill text-xs font-extrabold ${
                          ord.status === 'cancelled'
                            ? 'bg-red-100 text-red-700'
                            : ord.status === 'done'
                            ? 'bg-slate-200 text-slate-700'
                            : ord.status === 'ready'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-brand-light text-brand-deep'
                        }`}
                      >
                        {ord.statusLabel}
                      </span>
                    </td>
                    <td className="py-3 pl-3 text-right text-xs font-bold text-brand">
                      Открыть →
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Пагинация */}
        {totalPages > 1 && (
          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3.5 py-2 rounded-btn bg-slate-100 disabled:opacity-40"
            >
              ← Предыдущая
            </button>
            <span>
              Страница {page} из {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3.5 py-2 rounded-btn bg-slate-100 disabled:opacity-40"
            >
              Следующая →
            </button>
          </div>
        )}
      </div>

      {/* Детальная карточка заказа с историей статусов */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="bg-white rounded-panel shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900">
                  Заказ №{selectedOrder.number}
                </h2>
                <div className="text-xs text-slate-500 mt-0.5">
                  {selectedOrder.pointName} · К {selectedOrder.pickupTimeFormatted}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 font-bold text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-card bg-slate-50 border border-slate-200 space-y-1.5 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-bold text-slate-900">
                  Гость: {selectedOrder.customerName}
                </span>
                <span className="font-bold text-brand">
                  {formatPhoneDisplay(selectedOrder.customerPhone)}
                </span>
              </div>
              {selectedOrder.noShowCount > 0 && (
                <div className="inline-block px-2.5 py-1 rounded bg-red-100 text-red-800 text-xs font-extrabold">
                  Не забрал заказов: {selectedOrder.noShowCount}
                </div>
              )}
              {selectedOrder.comment && (
                <div className="text-xs text-slate-700 pt-1">
                  <b>Комментарий:</b> {selectedOrder.comment}
                </div>
              )}
            </div>

            {/* Состав */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-slate-500">Состав</h3>
              <div className="divide-y divide-slate-100 text-sm">
                {selectedOrder.items.map((item) => (
                  <div
                    key={item.id}
                    className="py-2 flex items-start justify-between gap-2"
                  >
                    <div>
                      <div className="font-bold text-slate-900">
                        {item.productName} × {item.quantity}
                      </div>
                      {item.modifiers.length > 0 && (
                        <div className="text-xs text-slate-500">
                          {item.modifiers
                            .map((m) => `${m.groupName}: ${m.optionName}`)
                            .join(' · ')}
                        </div>
                      )}
                    </div>
                    <div className="font-extrabold text-slate-900">
                      {item.lineTotal} ₽
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between font-extrabold text-base">
                <span>Итого</span>
                <span>{selectedOrder.total} ₽</span>
              </div>
            </div>

            {/* Управление статусом заказа из админки */}
            {['new', 'accepted', 'cooking', 'ready'].includes(
              selectedOrder.status
            ) && (
              <div className="p-4 rounded-card bg-brand-surface border border-blue-100 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-700">
                  Действия по заказу:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedOrder.status === 'new' && (
                    <button
                      type="button"
                      disabled={busyId === selectedOrder.id}
                      onClick={() => handleTransition(selectedOrder, 'accepted')}
                      className="px-4 py-2 rounded-btn bg-brand text-white font-bold text-xs"
                    >
                      Принять
                    </button>
                  )}
                  {selectedOrder.status === 'accepted' && (
                    <button
                      type="button"
                      disabled={busyId === selectedOrder.id}
                      onClick={() => handleTransition(selectedOrder, 'cooking')}
                      className="px-4 py-2 rounded-btn bg-indigo-600 text-white font-bold text-xs"
                    >
                      Начать готовить
                    </button>
                  )}
                  {selectedOrder.status === 'cooking' && (
                    <button
                      type="button"
                      disabled={busyId === selectedOrder.id}
                      onClick={() => handleTransition(selectedOrder, 'ready')}
                      className="px-4 py-2 rounded-btn bg-emerald-600 text-white font-bold text-xs"
                    >
                      Готов
                    </button>
                  )}
                  {selectedOrder.status === 'ready' && (
                    <button
                      type="button"
                      disabled={busyId === selectedOrder.id}
                      onClick={() => handleTransition(selectedOrder, 'done')}
                      className="px-4 py-2 rounded-btn bg-slate-900 text-white font-bold text-xs"
                    >
                      Выдан
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === selectedOrder.id}
                    onClick={() => setCancellingOrder(selectedOrder)}
                    className="px-3.5 py-2 rounded-btn border border-red-300 text-red-600 font-bold text-xs"
                  >
                    Отменить с причиной
                  </button>
                </div>
              </div>
            )}

            {/* История статусов */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-slate-500">
                История статусов
              </h3>
              <div className="space-y-2 text-xs">
                {(selectedOrder.history ?? []).map((h) => (
                  <div
                    key={h.id}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-extrabold text-slate-900">
                        {h.fromStatus
                          ? `${ORDER_STATUS_LABELS[h.fromStatus]} → `
                          : ''}
                        {ORDER_STATUS_LABELS[h.toStatus]}
                      </span>
                      {h.cancelReasonLabel && (
                        <span className="ml-2 text-red-600 font-semibold">
                          ({h.cancelReasonLabel})
                        </span>
                      )}
                    </div>
                    <div className="text-slate-500">
                      {h.actorName || h.actorRole} ·{' '}
                      {formatMiassDateTime(h.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {cancellingOrder && (
        <CancelOrderModal
          orderNumber={cancellingOrder.number}
          onClose={() => setCancellingOrder(null)}
          onConfirm={async (reason, comment) => {
            await handleTransition(cancellingOrder, 'cancelled', reason, comment);
            setCancellingOrder(null);
          }}
        />
      )}
    </div>
  );
}
