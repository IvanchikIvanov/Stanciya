'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Logo } from '@/core/ui/Logo';
import { NetworkBanner } from '@/core/ui/NetworkBanner';
import type { GuestOrderDto, OrderStatus } from '@/modules/coffee/orders/service';

const STEPS: Array<{ status: OrderStatus; label: string }> = [
  { status: 'new', label: 'Новый' },
  { status: 'accepted', label: 'Принят' },
  { status: 'cooking', label: 'Готовится' },
  { status: 'ready', label: 'Готов' },
  { status: 'done', label: 'Выдан' },
];

export default function OrderStatusPage() {
  const params = useParams<{ accessKey: string }>();
  const accessKey = params.accessKey;

  const [order, setOrder] = useState<GuestOrderDto | null>(null);
  const [user, setUser] = useState<{ id: number; name: string; role: string } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [notFoundError, setNotFoundError] = useState(false);
  const [pollOffline, setPollOffline] = useState(false);

  const [confirmCancel, setConfirmCancel] = useState(false);
  // Итог создания профиля при оформлении (?profile=created|failed)
  const [profileResult, setProfileResult] = useState<'created' | 'failed' | null>(null);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('profile');
    if (v === 'created' || v === 'failed') setProfileResult(v);
  }, []);
  const [cancelling, setCancelling] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchOrder = useCallback(
    async (isInitial = false) => {
      if (isInitial) setLoading(true);
      try {
        const res = await fetch(`/api/coffee/orders/${encodeURIComponent(accessKey)}`, {
          cache: 'no-store',
        });

        if (res.status === 404) {
          setNotFoundError(true);
          setPollOffline(false);
          return;
        }

        if (!res.ok) {
          throw new Error('Server error');
        }

        const data = await res.json();
        setOrder(data.order);
        setNotFoundError(false);
        setPollOffline(false);
      } catch {
        setPollOffline(true);
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [accessKey]
  );

  useEffect(() => {
    fetchOrder(true);
    fetch('/api/core/auth/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) setUser(d.user);
      })
      .catch(() => {});

    const interval = setInterval(() => {
      fetchOrder(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchOrder]);

  async function handleCancelOrder() {
    if (!order || cancelling) return;
    setCancelling(true);
    setActionMessage(null);
    try {
      const res = await fetch(
        `/api/coffee/orders/${encodeURIComponent(accessKey)}/cancel`,
        {
          method: 'POST',
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setActionMessage(data?.error?.message || 'Заказ уже обновлён');
        await fetchOrder(false);
      } else {
        setOrder(data.order);
      }
      setConfirmCancel(false);
    } catch {
      setActionMessage('Не удалось отменить заказ. Проверьте соединение.');
    } finally {
      setCancelling(false);
    }
  }

  function getStatusDescription(ord: GuestOrderDto): string {
    switch (ord.status) {
      case 'new':
        return 'Заказ отправлен, ждём подтверждения';
      case 'accepted':
        return `Заказ принят, будет готов к ${ord.pickupTimeFormatted}`;
      case 'cooking':
        return 'Готовим ваш заказ';
      case 'ready':
        return 'Заказ готов, можно забирать';
      case 'done':
        return 'Заказ выдан. Спасибо!';
      case 'cancelled':
        return ord.cancelReasonLabel
          ? `Заказ отменён (${ord.cancelReasonLabel})`
          : 'Заказ отменён';
    }
  }

  const currentStepIdx = order
    ? STEPS.findIndex((s) => s.status === order.status)
    : -1;

  return (
    <div className="min-h-screen bg-brand-surface flex flex-col pb-12">
      <NetworkBanner
        forceOffline={pollOffline}
        customMessage="Нет связи с сервером. Показан последний известный статус заказа."
      />

      <header className="bg-white/90 backdrop-blur border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo variant="dark" subtitle="Статус заказа" />
          <Link
            href="/"
            className="px-3.5 py-2 rounded-btn border border-slate-300 bg-white text-slate-800 hover:border-brand hover:text-brand text-xs sm:text-sm font-bold transition"
          >
            В каталог
          </Link>
        </div>
      </header>

      <main className="max-w-3xl w-full mx-auto px-4 py-6 space-y-5 flex-1">
        {loading ? (
          <div className="bg-white rounded-panel p-6 shadow-card space-y-4 animate-pulse">
            <div className="h-8 w-48 bg-slate-200 rounded" />
            <div className="h-24 bg-slate-100 rounded-card" />
            <div className="h-32 bg-slate-100 rounded-card" />
          </div>
        ) : notFoundError || !order ? (
          <div className="bg-white rounded-panel p-8 text-center shadow-card space-y-4 border border-red-100">
            <div className="text-xl font-extrabold text-slate-900">
              Заказ не найден
            </div>
            <p className="text-sm text-slate-600">
              Проверьте правильность ссылки на заказ.
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 rounded-btn bg-brand hover:bg-brand-dark text-white font-bold text-sm transition"
            >
              В каталог
            </Link>
          </div>
        ) : (
          <>
            {/* Главная карточка со статусом */}
            <section className="bg-white rounded-panel p-6 shadow-card border border-blue-100 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Номер заказа
                  </span>
                  <h1 className="text-3xl font-extrabold text-slate-900">
                    №{order.number}
                  </h1>
                </div>
                <span
                  className={`px-4 py-1.5 rounded-pill text-sm font-extrabold ${
                    order.status === 'cancelled'
                      ? 'bg-red-100 text-red-700'
                      : order.status === 'ready'
                      ? 'bg-emerald-100 text-emerald-800'
                      : order.status === 'done'
                      ? 'bg-slate-200 text-slate-800'
                      : 'bg-brand-light text-brand-deep'
                  }`}
                >
                  {order.statusLabel}
                </span>
              </div>

              <div
                className={`p-4 rounded-card font-bold text-sm sm:text-base ${
                  order.status === 'cancelled'
                    ? 'bg-red-50 text-red-800 border border-red-200'
                    : order.status === 'ready'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    : 'bg-brand-surface text-brand-deep border border-blue-100'
                }`}
              >
                {getStatusDescription(order)}
              </div>

              {/* Шкала этапов */}
              {order.status !== 'cancelled' && (
                <div className="grid grid-cols-5 gap-1.5 pt-1">
                  {STEPS.map((step, idx) => {
                    const doneOrActive = idx <= currentStepIdx;
                    return (
                      <div key={step.status} className="space-y-1.5 text-center">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            doneOrActive ? 'bg-brand' : 'bg-slate-200'
                          }`}
                        />
                        <div
                          className={`text-[11px] font-bold ${
                            doneOrActive ? 'text-brand-deep' : 'text-slate-400'
                          }`}
                        >
                          {step.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {actionMessage && (
                <div
                  role="alert"
                  className="p-3 rounded-btn bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold"
                >
                  {actionMessage}
                </div>
              )}

              {/* Точка и время получения */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-sm">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase">
                    Точка самовывоза
                  </div>
                  <div className="font-extrabold text-slate-900 mt-0.5">
                    {order.pointName}
                  </div>
                  <div className="text-xs text-slate-600">{order.pointAddress}</div>
                  {['accepted', 'cooking', 'ready'].includes(order.status) && (
                    <div className="text-xs font-bold text-brand mt-1">
                      Телефон точки: {order.pointPhone}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase">
                    Время получения
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span
                      className={`text-lg font-extrabold ${
                        order.pickupTimeAdjusted ? 'text-brand' : 'text-slate-900'
                      }`}
                    >
                      Сегодня к {order.pickupTimeFormatted}
                    </span>
                    {order.pickupTimeAdjusted && (
                      <span className="px-2.5 py-0.5 rounded-pill bg-amber-100 text-amber-900 text-xs font-extrabold">
                        Время уточнено
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Оплата при получении на точке
                  </div>
                </div>
              </div>

              {order.status === 'new' && order.requiresCall && (
                <div className="p-3 rounded-card bg-amber-50 border border-amber-200 text-sm font-semibold text-amber-950">
                  📞 Для заказа на эту сумму сотрудник позвонит вам по номеру{' '}
                  {order.customerPhone}, чтобы подтвердить заказ. Готовить начнём после звонка.
                </div>
              )}

              {/* Действия по статусу */}
              {order.status === 'new' && (
                <div className="pt-2 border-t border-slate-100">
                  {!confirmCancel ? (
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(true)}
                      className="px-4 py-2.5 rounded-btn border border-red-300 text-red-600 hover:bg-red-50 font-bold text-xs sm:text-sm transition"
                    >
                      Отменить заказ
                    </button>
                  ) : (
                    <div className="p-4 rounded-card bg-red-50 border border-red-200 space-y-3">
                      <div className="text-sm font-bold text-red-900">
                        Вы уверены, что хотите отменить заказ №{order.number}?
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={cancelling}
                          onClick={handleCancelOrder}
                          className="px-4 py-2 rounded-btn bg-red-600 hover:bg-red-700 text-white font-bold text-xs sm:text-sm"
                        >
                          {cancelling ? 'Отменяем...' : 'Да, отменить'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCancel(false)}
                          className="px-4 py-2 rounded-btn bg-white border border-slate-300 text-slate-700 font-bold text-xs sm:text-sm"
                        >
                          Оставить заказ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(order.status === 'done' || order.status === 'cancelled') && (
                <div className="pt-2 border-t border-slate-100">
                  <Link
                    href="/"
                    className="inline-block px-6 py-3 rounded-btn bg-brand hover:bg-brand-dark text-white font-bold text-sm transition"
                  >
                    В каталог
                  </Link>
                </div>
              )}
            </section>

            {/* Состав заказа */}
            <section className="bg-white rounded-panel p-6 shadow-card border border-blue-50 space-y-4">
              <h2 className="text-base font-extrabold text-slate-900">
                Состав заказа
              </h2>
              <div className="divide-y divide-slate-100">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="py-3 flex items-start justify-between gap-4"
                  >
                    <div>
                      <div className="font-bold text-slate-900 text-sm">
                        {item.productName} × {item.quantity}
                      </div>
                      {item.modifiers.length > 0 && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {item.modifiers
                            .map((m) => `${m.groupName}: ${m.optionName}`)
                            .join(' · ')}
                        </div>
                      )}
                    </div>
                    <div className="font-extrabold text-slate-900 text-sm shrink-0">
                      {item.lineTotal} ₽
                    </div>
                  </div>
                ))}
              </div>
              {order.comment && (
                <div className="p-3 rounded-btn bg-slate-50 text-xs text-slate-600">
                  <span className="font-bold text-slate-700">Комментарий: </span>
                  {order.comment}
                </div>
              )}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-700 text-sm">
                  Итого (оплата при получении)
                </span>
                <span className="text-xl font-extrabold text-slate-900">
                  {order.total} ₽
                </span>
              </div>
            </section>

            {profileResult === 'created' && user && (
              <div role="status" className="p-4 rounded-card bg-emerald-50 border border-emerald-200 text-sm font-semibold text-emerald-900">
                Профиль создан, заказ сохранён в истории. В следующий раз имя и телефон подставятся сами.
              </div>
            )}
            {profileResult === 'failed' && !user && (
              <div role="status" className="p-4 rounded-card bg-amber-50 border border-amber-200 text-sm font-semibold text-amber-950">
                Заказ оформлен, но профиль создать не удалось — возможно, этот номер уже зарегистрирован.{' '}
                <Link href="/login" className="underline text-brand">Войти</Link>
              </div>
            )}

          </>
        )}
      </main>
    </div>
  );
}
