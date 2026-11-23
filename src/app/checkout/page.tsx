'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/core/ui/Logo';
import { NetworkBanner } from '@/core/ui/NetworkBanner';
import type { PointDto } from '@/core/points/service';
import {
  getPickupChoiceFromStorage,
  getSelectedPointIdFromStorage,
  setSelectedPointIdInStorage,
  useCart,
} from '@/modules/coffee/catalog/cart-store';
import { rememberRecentOrder } from '@/modules/coffee/orders/recent-orders-store';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useCart();
  const formTopRef = useRef<HTMLFormElement>(null);

  const [points, setPoints] = useState<PointDto[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);
  const [isAsap, setIsAsap] = useState(true);
  const [pickupTime, setPickupTime] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('+7 ');
  const [comment, setComment] = useState('');
  const [placedOrderHref, setPlacedOrderHref] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateUuid());

  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadPointsAndProfile = useCallback(async () => {
    setLoading(true);
    try {
      const [ptsRes, meRes] = await Promise.all([
        fetch('/api/core/points?service=coffee', { cache: 'no-store' }),
        fetch('/api/core/auth/me', { cache: 'no-store' }),
      ]);

      if (ptsRes.ok) {
        const ptsData = await ptsRes.json();
        const loadedPoints: PointDto[] = ptsData.points ?? [];
        setPoints(loadedPoints);

        const openPoints = loadedPoints.filter(
          (p) => p.acceptsOrders && p.isOpenNow && p.hasSlotsToday
        );
        const storedPt = getSelectedPointIdFromStorage();

        if (openPoints.length === 1) {
          setSelectedPointId(openPoints[0].id);
          setSelectedPointIdInStorage(openPoints[0].id);
        } else if (storedPt && openPoints.some((p) => p.id === storedPt)) {
          setSelectedPointId(storedPt);
        } else if (openPoints.length > 0) {
          setSelectedPointId(openPoints[0].id);
        }

        // Время, выбранное в блоке «Твой предзаказ» на главной
        const pickupChoice = getPickupChoiceFromStorage();
        if (pickupChoice) {
          setIsAsap(pickupChoice.isAsap);
          if (!pickupChoice.isAsap && pickupChoice.time) setPickupTime(pickupChoice.time);
        }
      }

      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.user && meData.user.role === 'client') {
          setCustomerName((prev) => prev || meData.user.name || '');
          if (meData.user.phone) {
            setCustomerPhone(meData.user.phone);
          }
        }
      }
    } catch {
      setGeneralError('Не удалось загрузить список точек. Проверьте соединение.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPointsAndProfile();
  }, [loadPointsAndProfile]);

  const currentPoint = useMemo(
    () => points.find((p) => p.id === selectedPointId) ?? null,
    [points, selectedPointId]
  );

  useEffect(() => {
    if (currentPoint && currentPoint.slots.length > 0) {
      if (!pickupTime || !currentPoint.slots.some((s) => s.time === pickupTime)) {
        setPickupTime(currentPoint.slots[0].time);
      }
    }
  }, [currentPoint, pickupTime]);

  function handlePhoneChange(val: string) {
    if (!val.startsWith('+7')) {
      const digits = val.replace(/\D/g, '');
      if (digits.startsWith('7') || digits.startsWith('8')) {
        setCustomerPhone(`+7${digits.slice(1, 11)}`);
      } else {
        setCustomerPhone(`+7${digits.slice(0, 10)}`);
      }
    } else {
      setCustomerPhone(val);
    }
    setIdempotencyKey(generateUuid());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || placedOrderHref) return;

    setGeneralError(null);
    setFieldErrors({});

    const nextFieldErrors: Record<string, string> = {};
    if (!selectedPointId || !currentPoint) {
      nextFieldErrors.pointId = 'Выберите точку самовывоза';
    } else if (!currentPoint.isOpenNow || !currentPoint.acceptsOrders || !currentPoint.hasSlotsToday) {
      nextFieldErrors.pointId = 'Сегодня эта точка больше не принимает заказы. Выберите другую точку.';
    }

    if (customerName.trim().length < 2 || customerName.trim().length > 40) {
      nextFieldErrors.customerName = 'Имя должно быть от 2 до 40 символов';
    }

    if (comment.trim().length > 200) {
      nextFieldErrors.comment = 'Комментарий не должен превышать 200 символов';
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      formTopRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/coffee/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          pointId: selectedPointId,
          isAsap,
          pickupTime: isAsap ? undefined : pickupTime,
          customerName: customerName.trim(),
          customerPhone,
          comment: comment.trim(),
          items: cart.items.map((i) => ({
            productId: i.productId,
            optionIds: i.optionIds,
            quantity: i.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const code = data?.error?.code;
        const message = data?.error?.message || 'Не удалось оформить заказ';

        if (code === 'PRODUCT_UNAVAILABLE' || code === 'MODIFIER_UNAVAILABLE') {
          router.push('/cart');
          return;
        }

        if (code === 'SLOT_UNAVAILABLE' || code === 'NO_SLOTS_TODAY') {
          await loadPointsAndProfile();
          setIdempotencyKey(generateUuid());
          setGeneralError(message);
          return;
        }

        if (data?.error?.fields) {
          setFieldErrors(data.error.fields);
        }
        setGeneralError(message);
        setIdempotencyKey(generateUuid());
        formTopRef.current?.scrollIntoView({ behavior: 'smooth' });
        return;
      }

      const orderHref = `/order/${encodeURIComponent(data.order.accessKey)}`;
      setPlacedOrderHref(orderHref);
      rememberRecentOrder({ accessKey: data.order.accessKey, number: data.order.number });
      cart.clear();
      router.replace(orderHref);
    } catch {
      setGeneralError(
        'Не удалось отправить заказ из-за ошибки сети. Проверьте соединение и нажмите «Повторить».'
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitting || placedOrderHref) {
    return (
      <main className="min-h-screen bg-brand-surface flex flex-col items-center justify-center gap-4 px-4 text-center">
        <div role="status" className="flex flex-col items-center gap-3">
          <span
            aria-hidden="true"
            className="w-12 h-12 rounded-full border-4 border-brand/20 border-t-brand motion-safe:animate-spin"
          />
          <div className="text-lg font-extrabold text-slate-900">
            {placedOrderHref ? 'Заказ отправлен' : 'Отправляем заказ…'}
          </div>
          {placedOrderHref && (
            <p className="text-sm text-slate-600">Открываем страницу заказа…</p>
          )}
        </div>
        {placedOrderHref && (
          <Link href={placedOrderHref} replace className="text-sm font-bold text-brand underline underline-offset-2">
            Открыть заказ
          </Link>
        )}
      </main>
    );
  }

  if (cart.hydrated && cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-brand-surface flex flex-col">
        <header className="bg-white/90 backdrop-blur border-b border-slate-200/80 sticky top-0 z-30">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <Logo variant="dark" subtitle="Оформление" />
            <Link href="/" className="text-sm font-bold text-slate-800 underline">
              В каталог
            </Link>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-12 text-center">
          <div className="bg-white rounded-panel p-8 shadow-card space-y-4">
            <h1 className="text-xl font-extrabold text-slate-900">Корзина пуста</h1>
            <Link
              href="/"
              className="inline-block px-6 py-3 rounded-btn bg-brand text-white font-bold text-sm"
            >
              Перейти в каталог
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-surface flex flex-col pb-12">
      <NetworkBanner />

      <header className="bg-white/90 backdrop-blur border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo variant="dark" subtitle="Оформление заказа" />
          <Link
            href="/cart"
            className="px-3.5 py-2 rounded-btn border border-slate-300 bg-white text-slate-800 hover:border-brand hover:text-brand text-xs sm:text-sm font-bold transition"
          >
            ← В корзину
          </Link>
        </div>
      </header>

      <main className="max-w-3xl w-full mx-auto px-4 py-6 flex-1">
        <form
          ref={formTopRef}
          onSubmit={handleSubmit}
          className="space-y-6"
          noValidate
        >
          <h1 className="text-2xl font-extrabold text-slate-900">
            Оформление самовывоза
          </h1>

          {generalError && (
            <div
              role="alert"
              className="p-4 rounded-card bg-red-50 border border-red-200 text-red-800 text-sm font-semibold flex flex-wrap items-center justify-between gap-3"
            >
              <span>{generalError}</span>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-extrabold"
              >
                Повторить
              </button>
            </div>
          )}

          {/* 1. Выбор точки */}
          <section className="bg-white rounded-panel p-5 shadow-card space-y-3 border border-blue-50">
            <h2 className="text-base font-extrabold text-slate-900">
              1. Точка самовывоза *
            </h2>

            {loading ? (
              <div className="h-20 bg-slate-100 rounded-btn animate-pulse" />
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {points.map((pt) => {
                  const canSelect =
                    pt.acceptsOrders && pt.isOpenNow && pt.hasSlotsToday;
                  const isSelected = selectedPointId === pt.id;
                  return (
                    <button
                      key={pt.id}
                      type="button"
                      disabled={!canSelect}
                      onClick={() => {
                        setSelectedPointId(pt.id);
                        setSelectedPointIdInStorage(pt.id);
                        setIdempotencyKey(generateUuid());
                      }}
                      className={`p-4 rounded-btn border text-left transition flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
                        !canSelect
                          ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          : isSelected
                          ? 'bg-brand-light border-brand text-slate-900 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-blue-300 text-slate-800'
                      }`}
                    >
                      <div className="min-w-0 break-words">
                        <div className="font-extrabold text-sm sm:text-base">
                          {pt.name}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {pt.address}
                        </div>
                      </div>
                      <div className="text-xs font-bold sm:max-w-[45%] sm:text-right">
                        {!pt.isOpenNow || !pt.acceptsOrders ? (
                          <span className="text-red-600">
                            {pt.closedUntilLabel || 'Закрыто'}
                          </span>
                        ) : !pt.hasSlotsToday ? (
                          <span className="text-amber-700">
                            Сегодня больше не принимает заказы
                          </span>
                        ) : (
                          <span className="text-brand">
                            Готово с {pt.asapSlot?.time}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {fieldErrors.pointId && (
              <p className="text-xs text-red-600 font-semibold">
                {fieldErrors.pointId}
              </p>
            )}
          </section>

          {/* 2. Время получения */}
          <section className="bg-white rounded-panel p-5 shadow-card space-y-3 border border-blue-50">
            <h2 className="text-base font-extrabold text-slate-900">
              2. Время получения (сегодня) *
            </h2>

            {currentPoint && !currentPoint.hasSlotsToday ? (
              <div className="p-3.5 rounded-btn bg-amber-50 border border-amber-200 text-amber-900 text-sm font-semibold">
                Сегодня эта точка больше не принимает заказы. Пожалуйста, выберите другую точку.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAsap(true);
                      setIdempotencyKey(generateUuid());
                    }}
                    className={`p-3.5 rounded-btn border text-left font-bold text-sm transition ${
                      isAsap
                        ? 'bg-brand-light border-brand text-brand-deep'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <div>Как можно скорее</div>
                    {currentPoint?.asapSlot && (
                      <div className="text-xs font-normal text-slate-600 mt-0.5">
                        Ориентировочно к {currentPoint.asapSlot.time}
                      </div>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsAsap(false);
                      setIdempotencyKey(generateUuid());
                    }}
                    className={`p-3.5 rounded-btn border text-left font-bold text-sm transition ${
                      !isAsap
                        ? 'bg-brand-light border-brand text-brand-deep'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <div>К определённому времени</div>
                    <div className="text-xs font-normal text-slate-600 mt-0.5">
                      Выбрать удобный слот на сегодня
                    </div>
                  </button>
                </div>

                {!isAsap && currentPoint && (
                  <div>
                    <label
                      htmlFor="checkout-slot-select"
                      className="block text-xs font-bold text-slate-600 mb-1.5"
                    >
                      Выберите время готовности:
                    </label>
                    <select
                      id="checkout-slot-select"
                      value={pickupTime}
                      onChange={(e) => {
                        setPickupTime(e.target.value);
                        setIdempotencyKey(generateUuid());
                      }}
                      className="w-full max-w-full sm:w-64 px-4 py-3 rounded-btn border border-slate-300 font-bold text-base text-slate-900"
                    >
                      {currentPoint.slots.map((s) => (
                        <option key={s.time} value={s.time}>
                          Сегодня к {s.time}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {fieldErrors.pickupTime && (
              <p className="text-xs text-red-600 font-semibold">
                {fieldErrors.pickupTime}
              </p>
            )}
          </section>

          {/* 3. Контактные данные */}
          <section className="bg-white rounded-panel p-5 shadow-card space-y-4 border border-blue-50">
            <h2 className="text-base font-extrabold text-slate-900">
              3. Ваши контакты
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="checkout-name"
                  className="block text-sm font-bold text-slate-700 mb-1.5"
                >
                  Ваше имя *
                </label>
                <input
                  id="checkout-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={40}
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setIdempotencyKey(generateUuid());
                  }}
                  placeholder="Например, Александр"
                  className="w-full min-w-0 px-4 py-3 rounded-btn border border-slate-300 text-base text-slate-900"
                />
                {fieldErrors.customerName && (
                  <p className="text-xs text-red-600 font-semibold mt-1">
                    {fieldErrors.customerName}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="checkout-phone"
                  className="block text-sm font-bold text-slate-700 mb-1.5"
                >
                  Телефон *
                </label>
                <input
                  id="checkout-phone"
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="+7 (900) 000-00-00"
                  className="w-full min-w-0 px-4 py-3 rounded-btn border border-slate-300 text-base text-slate-900"
                />
                {fieldErrors.customerPhone && (
                  <p className="text-xs text-red-600 font-semibold mt-1">
                    {fieldErrors.customerPhone}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="checkout-comment"
                className="block text-sm font-bold text-slate-700 mb-1.5"
              >
                Комментарий к заказу (необязательно, до 200 символов)
              </label>
              <textarea
                id="checkout-comment"
                rows={2}
                maxLength={200}
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                  setIdempotencyKey(generateUuid());
                }}
                placeholder="Например: сделать погорячее, без крышки"
                className="w-full min-w-0 px-4 py-2.5 rounded-btn border border-slate-300 text-base text-slate-900"
              />
              {fieldErrors.comment && (
                <p className="text-xs text-red-600 font-semibold mt-1">
                  {fieldErrors.comment}
                </p>
              )}
            </div>
          </section>

          {/* 4. Подтверждение заказа */}
          <section className="bg-white rounded-panel p-5 shadow-card space-y-4 border border-blue-100">
            <div className="flex items-center justify-between text-base font-bold text-slate-700">
              <span>Оплата при получении на точке</span>
              <span className="text-xl font-extrabold text-slate-900">
                {cart.totalSum} ₽
              </span>
            </div>

            <button
              type="submit"
              disabled={!selectedPointId || !currentPoint?.hasSlotsToday}
              className="w-full min-h-[52px] py-3.5 px-6 rounded-btn bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-extrabold text-base transition shadow-sm"
            >
              Заказать на {cart.totalSum} ₽
            </button>

            <p className="text-[11px] sm:text-xs leading-relaxed text-slate-500 text-center">
              Оформляя заказ, вы соглашаетесь с{' '}
              <Link href="/info/pickup" target="_blank" className="text-brand font-semibold underline">
                правилами самовывоза и оплаты
              </Link>{' '}
              и{' '}
              <Link href="/info/privacy" target="_blank" className="text-brand font-semibold underline">
                политикой конфиденциальности
              </Link>
              .
            </p>
          </section>
        </form>
      </main>
    </div>
  );
}
