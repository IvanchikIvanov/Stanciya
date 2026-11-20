'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPhoneDisplay } from '@/core/phone';
import { formatMiassTime } from '@/core/time';
import type { OrderStatus, StaffOrderDto } from '../orders/service';
import { CancelOrderModal } from './CancelOrderModal';
import { StopListModal } from './StopListModal';
import { playNewOrderBeep, unlockAudioContext } from './sound';

type FilterTab = 'active' | 'new' | 'accepted' | 'cooking' | 'ready' | 'completed';

interface BaristaBoardProps {
  initialPointName: string;
  staffName: string;
  isAdmin: boolean;
}

export function BaristaBoard({
  initialPointName,
  staffName,
  isAdmin,
}: BaristaBoardProps) {
  const router = useRouter();

  const [pointName, setPointName] = useState(initialPointName);
  const [activeOrders, setActiveOrders] = useState<StaffOrderDto[]>([]);
  const [completedOrders, setCompletedOrders] = useState<StaffOrderDto[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({
    active: 0,
    new: 0,
    accepted: 0,
    cooking: 0,
    ready: 0,
    completed: 0,
  });

  const [filter, setFilter] = useState<FilterTab>('active');
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const [highlightedIds, setHighlightedIds] = useState<number[]>([]);
  const [toastMessages, setToastMessages] = useState<string[]>([]);
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [shiftByOrder, setShiftByOrder] = useState<Record<number, 0 | 5 | 10 | 15>>({});
  // Отметка «Звонок сделан» для заказов дороже порога (п. 4.4 ТЗ)
  const [callDoneByOrder, setCallDoneByOrder] = useState<Record<number, boolean>>({});
  const [cancellingOrder, setCancellingOrder] = useState<StaffOrderDto | null>(null);
  const [stopListOpen, setStopListOpen] = useState(false);
  // Часы для подписей «через N мин»: обновляются раз в 20 секунд
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  const [actionError, setActionError] = useState<string | null>(null);

  const knownActiveMapRef = useRef<Map<number, { number: number; status: OrderStatus }> | null>(
    null
  );
  const wasOfflineRef = useRef(false);

  function addToast(msg: string) {
    setToastMessages((prev) => [msg, ...prev.slice(0, 3)]);
    setTimeout(() => {
      setToastMessages((prev) => prev.filter((m) => m !== msg));
    }, 7000);
  }

  const fetchQueue = useCallback(
    async (isFirstLoad = false) => {
      if (isFirstLoad) setLoading(true);
      try {
        const res = await fetch('/api/coffee/barista/orders', { cache: 'no-store' });
        if (res.status === 401 || res.status === 403) {
          router.push('/staff/login');
          return;
        }
        if (!res.ok) {
          throw new Error('Server error');
        }

        const data = await res.json();
        const nextActive: StaffOrderDto[] = data.activeOrders ?? [];
        const nextCompleted: StaffOrderDto[] = data.completedTodayOrders ?? [];

        setPointName(data.pointName || initialPointName);
        setActiveOrders(nextActive);
        setCompletedOrders(nextCompleted);
        setCounts(data.counts ?? {});

        const prevMap = knownActiveMapRef.current;
        if (prevMap !== null) {
          const newlyArrivedIds: number[] = [];
          for (const ord of nextActive) {
            if (!prevMap.has(ord.id) && ord.status === 'new') {
              newlyArrivedIds.push(ord.id);
            }
          }

          // Проверяем, отменил ли гость заказ, который раньше был в активных
          for (const [prevId, prevMeta] of prevMap.entries()) {
            const stillInActive = nextActive.some((o) => o.id === prevId);
            if (!stillInActive) {
              const inCompleted = nextCompleted.find((o) => o.id === prevId);
              if (
                inCompleted &&
                inCompleted.status === 'cancelled' &&
                inCompleted.cancelReasonLabel === 'Отменён вами'
              ) {
                addToast(`Заказ №${prevMeta.number} отменён гостем`);
              }
            }
          }

          if (newlyArrivedIds.length > 0) {
            setHighlightedIds((prev) =>
              Array.from(new Set([...prev, ...newlyArrivedIds]))
            );
            playNewOrderBeep();
          } else if (wasOfflineRef.current) {
            // Связь вернулась
            wasOfflineRef.current = false;
          }
        }

        const updatedMap = new Map<number, { number: number; status: OrderStatus }>();
        for (const ord of nextActive) {
          updatedMap.set(ord.id, { number: ord.number, status: ord.status });
        }
        knownActiveMapRef.current = updatedMap;
        setIsOffline(false);
        wasOfflineRef.current = false;
      } catch {
        setIsOffline(true);
        wasOfflineRef.current = true;
      } finally {
        if (isFirstLoad) setLoading(false);
      }
    },
    [initialPointName, router]
  );

  useEffect(() => {
    fetchQueue(true);
    const interval = setInterval(() => {
      fetchQueue(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  function handleEnableSound() {
    const ok = unlockAudioContext();
    setSoundEnabled(ok);
    if (ok) {
      playNewOrderBeep();
    }
  }

  async function handleStatusTransition(
    order: StaffOrderDto,
    toStatus: OrderStatus,
    cancelReason?: string,
    cancelComment?: string
  ) {
    if (isOffline || busyOrderId !== null) return;
    setBusyOrderId(order.id);
    setActionError(null);

    try {
      const shiftMinutes =
        order.status === 'new' && toStatus === 'accepted'
          ? shiftByOrder[order.id] ?? 0
          : undefined;
      const callConfirmed =
        order.status === 'new' && toStatus === 'accepted' && needsCallConfirmation(order)
          ? callDoneByOrder[order.id] === true
          : undefined;

      const res = await fetch(`/api/coffee/barista/orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedFromStatus: order.status,
          toStatus,
          shiftMinutes,
          cancelReason,
          cancelComment,
          callConfirmed,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data?.error?.code === 'ORDER_ALREADY_UPDATED') {
          addToast(`Заказ №${order.number}: Заказ уже обновлён`);
          await fetchQueue(false);
          return;
        }
        const msg = data?.error?.message || 'Не удалось сохранить, повторите';
        setActionError(msg);
        throw new Error(msg);
      }

      setHighlightedIds((prev) => prev.filter((id) => id !== order.id));
      await fetchQueue(false);
    } catch (err: any) {
      if (!actionError) {
        setActionError('Не удалось сохранить, повторите');
      }
      throw err;
    } finally {
      setBusyOrderId(null);
    }
  }

  const displayedOrders = useMemo(() => {
    if (filter === 'completed') return completedOrders;
    if (filter === 'active') return activeOrders;
    return activeOrders.filter((o) => o.status === filter);
  }, [filter, activeOrders, completedOrders]);

  async function handleLogout() {
    await fetch('/api/core/auth/logout', { method: 'POST' });
    router.push('/staff/login');
  }


  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Плашка отсутствия связи */}
      {isOffline && (
        <div
          role="alert"
          className="bg-red-600 text-white text-center py-3 px-4 font-extrabold text-sm shadow-md"
        >
          Нет соединения, заказы не обновляются
        </div>
      )}

      {/* Предупреждение на узких экранах (< 768 px) */}
      <div className="md:hidden bg-amber-100 border-b border-amber-300 text-amber-950 text-xs font-bold px-4 py-2 text-center">
        Панель бариста рассчитана на планшеты (от 768 px) и компьютеры.
      </div>

      {/* Шапка панели бариста */}
      <header className="bg-brand-ink text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-white.png" alt="СТАНЦИЯ" className="h-6 w-auto mr-1" />
              <div className="pl-3 border-l border-white/20">
                <div className="font-extrabold text-base leading-none">
                  {pointName}
                </div>
                <div className="text-xs text-white/60 mt-0.5">
                  Панель бариста · {staffName}
                </div>
              </div>
            </div>

            {/* Индикатор связи */}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-pill text-xs font-bold ${
                isOffline
                  ? 'bg-red-500 text-white'
                  : 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOffline ? 'bg-white' : 'bg-emerald-400 animate-pulse'
                }`}
              />
              {isOffline ? 'Офлайн' : 'На связи'}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {!soundEnabled ? (
              <button
                type="button"
                onClick={handleEnableSound}
                className="min-h-[44px] px-4 py-2 rounded-btn bg-white text-brand font-extrabold text-xs sm:text-sm shadow-xs hover:bg-brand-light transition"
              >
                🔔 Включить звук
              </button>
            ) : (
              <span className="px-3 py-2 rounded-btn bg-white/10 text-xs font-semibold text-white/80">
                🔊 Звук включён
              </span>
            )}

            <button
              type="button"
              onClick={() => setStopListOpen(true)}
              className="min-h-[44px] px-3.5 py-2 rounded-btn bg-white/10 hover:bg-white/20 text-xs sm:text-sm font-bold"
            >
              Стоп-лист
            </button>

            {isAdmin && (
              <a
                href="/admin"
                className="min-h-[44px] px-3.5 py-2 rounded-btn bg-white/15 hover:bg-white/25 text-xs font-bold flex items-center"
              >
                В админку
              </a>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[44px] px-3.5 py-2 rounded-btn bg-white/10 hover:bg-white/20 text-xs font-bold"
            >
              Выход
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 py-5 space-y-4 flex-1">
        {/* Уведомления (например, отмена гостем) */}
        {toastMessages.length > 0 && (
          <div className="space-y-2">
            {toastMessages.map((msg, i) => (
              <div
                key={i}
                role="status"
                className="p-3.5 rounded-card bg-amber-100 border border-amber-300 text-amber-950 font-extrabold text-sm flex items-center justify-between"
              >
                <span>{msg}</span>
                <button
                  type="button"
                  onClick={() =>
                    setToastMessages((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="text-xs font-bold underline"
                >
                  Скрыть
                </button>
              </div>
            ))}
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            className="p-3.5 rounded-card bg-red-50 border border-red-200 text-red-700 font-bold text-sm flex items-center justify-between"
          >
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-xs underline"
            >
              Закрыть
            </button>
          </div>
        )}

        {/* Фильтр по статусам со счётчиками */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'active' as FilterTab, label: 'Активные', count: counts.active ?? 0 },
            { id: 'new' as FilterTab, label: 'Новые', count: counts.new ?? 0 },
            { id: 'accepted' as FilterTab, label: 'Принятые', count: counts.accepted ?? 0 },
            { id: 'cooking' as FilterTab, label: 'Готовятся', count: counts.cooking ?? 0 },
            { id: 'ready' as FilterTab, label: 'Готовы', count: counts.ready ?? 0 },
            {
              id: 'completed' as FilterTab,
              label: 'Завершённые за сегодня',
              count: counts.completed ?? 0,
            },
          ].map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`min-h-[44px] px-4 py-2 rounded-btn font-bold text-sm flex items-center gap-2 transition ${
                  active
                    ? 'bg-brand text-white shadow-sm'
                    : 'bg-white text-slate-700 hover:bg-blue-50 border border-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-pill text-xs font-extrabold ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Сетка карточек очереди */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-panel p-5 h-72 animate-pulse shadow-card"
              />
            ))}
          </div>
        ) : displayedOrders.length === 0 ? (
          <div className="bg-white rounded-panel p-12 text-center shadow-card border border-slate-200">
            <div className="text-lg font-extrabold text-slate-700">
              {filter === 'completed'
                ? 'Завершённых заказов за сегодня пока нет'
                : 'Активных заказов нет'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedOrders.map((ord) => {
              const isHighlighted = highlightedIds.includes(ord.id);
              const isActiveStatus = ['new', 'accepted', 'cooking', 'ready'].includes(
                ord.status
              );
              const minutesLeft = Math.round(
                (new Date(ord.pickupAt).getTime() - nowMs) / 60_000
              );
              const isOverdue = isActiveStatus && minutesLeft < 0;
              const isSoon = isActiveStatus && !isOverdue && minutesLeft <= 15;
              const isBusy = busyOrderId === ord.id;
              const selectedShift = shiftByOrder[ord.id] ?? 0;

              return (
                <article
                  key={ord.id}
                  onClick={() => {
                    if (isHighlighted) {
                      setHighlightedIds((prev) => prev.filter((id) => id !== ord.id));
                    }
                  }}
                  className={`bg-white rounded-panel p-5 shadow-card border-2 flex flex-col justify-between gap-4 transition ${
                    isHighlighted
                      ? 'border-brand ring-4 ring-brand/20 bg-blue-50/30'
                      : ord.status === 'new'
                      ? 'border-amber-400'
                      : ord.status === 'ready'
                      ? 'border-emerald-400'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Заголовок карточки */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-extrabold text-slate-900">
                            №{ord.number}
                          </span>
                          {isHighlighted && (
                            <span className="px-2 py-0.5 rounded-pill bg-brand text-white text-[11px] font-extrabold uppercase">
                              Новый!
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          Создан в {formatMiassTime(ord.createdAt)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div
                          className={`text-2xl font-extrabold leading-none ${
                            isOverdue ? 'text-red-600' : 'text-slate-900'
                          }`}
                        >
                          {ord.pickupTimeFormatted}
                        </div>
                        {isActiveStatus && (
                          <div
                            className={`inline-block mt-1.5 px-2.5 py-1 rounded-pill text-xs font-extrabold ${
                              isOverdue
                                ? 'bg-red-600 text-white'
                                : isSoon
                                ? 'bg-amber-400 text-amber-950'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {formatMinutesLeft(minutesLeft)}
                          </div>
                        )}
                        <span
                          className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-pill text-xs font-extrabold ${
                            ord.status === 'new'
                              ? 'bg-amber-100 text-amber-900'
                              : ord.status === 'accepted'
                              ? 'bg-blue-100 text-brand-deep'
                              : ord.status === 'cooking'
                              ? 'bg-indigo-100 text-indigo-900'
                              : ord.status === 'ready'
                              ? 'bg-emerald-100 text-emerald-900'
                              : ord.status === 'done'
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {ord.statusLabel}
                        </span>
                      </div>
                    </div>

                    {/* Гость и метка невыкупа */}
                    <div className="p-3 rounded-btn bg-slate-50 border border-slate-200/80 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {ord.customerName}
                        </span>
                        <a
                          href={`tel:${ord.customerPhone}`}
                          className="font-bold text-brand text-xs sm:text-sm hover:underline"
                        >
                          {formatPhoneDisplay(ord.customerPhone)}
                        </a>
                      </div>

                      {ord.noShowCount > 0 && (
                        <div className="inline-block px-2.5 py-1 rounded-lg bg-red-100 text-red-800 text-xs font-extrabold">
                          ⚠ Не забрал заказов: {ord.noShowCount}
                        </div>
                      )}

                      {needsCallConfirmation(ord) && (
                        <div className="mt-2 p-2.5 rounded-lg bg-amber-100 border border-amber-300 space-y-2">
                          <div className="text-xs font-extrabold text-amber-950">
                            📞 Заказ на {ord.total} ₽ — позвоните гостю и подтвердите заказ
                          </div>
                          <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer text-sm font-bold text-amber-950">
                            <input
                              type="checkbox"
                              className="w-5 h-5 accent-amber-600"
                              checked={callDoneByOrder[ord.id] === true}
                              disabled={isOffline || isBusy}
                              onChange={(e) =>
                                setCallDoneByOrder((prev) => ({
                                  ...prev,
                                  [ord.id]: e.target.checked,
                                }))
                              }
                            />
                            Звонок сделан, гость подтвердил
                          </label>
                        </div>
                      )}

                      {ord.requiresCall && ord.callConfirmedAt && (
                        <div className="inline-block mt-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-extrabold">
                          ✓ Звонок подтверждён
                        </div>
                      )}
                    </div>

                    {/* Позиции заказа */}
                    <div className="divide-y divide-slate-100">
                      {ord.items.map((item) => (
                        <div
                          key={item.id}
                          className="py-2 flex items-start justify-between gap-2"
                        >
                          <div>
                            <div className="font-extrabold text-slate-900 text-sm">
                              {item.productName} × {item.quantity}
                            </div>
                            {item.modifiers.length > 0 && (
                              <div className="text-xs text-slate-600 mt-0.5">
                                {item.modifiers
                                  .map((m) => `${m.groupName}: ${m.optionName}`)
                                  .join(' · ')}
                              </div>
                            )}
                          </div>
                          <span className="text-xs font-bold text-slate-700 shrink-0">
                            {item.lineTotal} ₽
                          </span>
                        </div>
                      ))}
                    </div>

                    {ord.comment && (
                      <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950">
                        <span className="font-bold">Комментарий: </span>
                        {ord.comment}
                      </div>
                    )}

                    {ord.status === 'cancelled' && ord.cancelReasonLabel && (
                      <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 font-semibold">
                        Причина отмены: {ord.cancelReasonLabel}
                      </div>
                    )}
                  </div>

                  {/* Нижний блок: сумма и кнопки действий */}
                  <div className="pt-3 border-t border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500 uppercase">
                        К оплате на кассе
                      </span>
                      <span className="text-lg font-extrabold text-slate-900">
                        {ord.total} ₽
                      </span>
                    </div>

                    {/* Сдвиг времени выдачи при принятии нового заказа */}
                    {ord.status === 'new' && (
                      <div className="space-y-1">
                        <div className="text-[11px] font-bold text-slate-500">
                          Сдвинуть время выдачи при принятии:
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {([0, 5, 10, 15] as const).map((min) => (
                            <button
                              key={min}
                              type="button"
                              disabled={isOffline || isBusy}
                              onClick={() =>
                                setShiftByOrder((prev) => ({
                                  ...prev,
                                  [ord.id]: min,
                                }))
                              }
                              className={`min-h-[40px] rounded-lg text-xs font-extrabold border transition ${
                                selectedShift === min
                                  ? 'bg-brand-light border-brand text-brand-deep'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {min === 0 ? 'Без сдвига' : `+${min} мин`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Кнопки смены статуса (высота не меньше 44 px) */}
                    {isActiveStatus && (
                      <div className="flex items-center gap-2">
                        {ord.status === 'new' && (
                          <button
                            type="button"
                            disabled={
                              isOffline ||
                              isBusy ||
                              (needsCallConfirmation(ord) && callDoneByOrder[ord.id] !== true)
                            }
                            title={
                              needsCallConfirmation(ord) && callDoneByOrder[ord.id] !== true
                                ? 'Сначала позвоните гостю и отметьте «Звонок сделан»'
                                : undefined
                            }
                            onClick={() => handleStatusTransition(ord, 'accepted')}
                            className="flex-1 min-h-[46px] px-4 py-2.5 rounded-btn bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-extrabold text-sm transition"
                          >
                            {isBusy
                              ? 'Сохраняем...'
                              : selectedShift > 0
                              ? `Принять (+${selectedShift} мин)`
                              : 'Принять'}
                          </button>
                        )}

                        {ord.status === 'accepted' && (
                          <button
                            type="button"
                            disabled={isOffline || isBusy}
                            onClick={() => handleStatusTransition(ord, 'cooking')}
                            className="flex-1 min-h-[46px] px-4 py-2.5 rounded-btn bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-sm transition"
                          >
                            {isBusy ? 'Сохраняем...' : 'Начать готовить'}
                          </button>
                        )}

                        {ord.status === 'cooking' && (
                          <button
                            type="button"
                            disabled={isOffline || isBusy}
                            onClick={() => handleStatusTransition(ord, 'ready')}
                            className="flex-1 min-h-[46px] px-4 py-2.5 rounded-btn bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-sm transition"
                          >
                            {isBusy ? 'Сохраняем...' : 'Готов'}
                          </button>
                        )}

                        {ord.status === 'ready' && (
                          <button
                            type="button"
                            disabled={isOffline || isBusy}
                            onClick={() => handleStatusTransition(ord, 'done')}
                            className="flex-1 min-h-[46px] px-4 py-2.5 rounded-btn bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-extrabold text-sm transition"
                          >
                            {isBusy ? 'Сохраняем...' : 'Выдан'}
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isOffline || isBusy}
                          onClick={() => setCancellingOrder(ord)}
                          className="min-h-[46px] px-3.5 py-2.5 rounded-btn border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 font-bold text-xs sm:text-sm transition"
                        >
                          Отменить
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {stopListOpen && <StopListModal onClose={() => setStopListOpen(false)} />}

      {cancellingOrder && (
        <CancelOrderModal
          orderNumber={cancellingOrder.number}
          onClose={() => setCancellingOrder(null)}
          onConfirm={async (reason, comment) => {
            await handleStatusTransition(
              cancellingOrder,
              'cancelled',
              reason,
              comment
            );
            setCancellingOrder(null);
          }}
        />
      )}
    </div>
  );
}

/** Заказ дороже порога ещё не подтверждён звонком гостю. */
function needsCallConfirmation(order: StaffOrderDto): boolean {
  return order.status === 'new' && order.requiresCall && !order.callConfirmedAt;
}

/** «через 7 мин», «через 1 ч 05 мин», «сейчас», «просрочен на 4 мин» */
function formatMinutesLeft(minutes: number): string {
  if (minutes < 0) return `просрочен на ${formatDuration(-minutes)}`;
  if (minutes === 0) return 'сейчас';
  return `через ${formatDuration(minutes)}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${String(m).padStart(2, '0')} мин`;
}
