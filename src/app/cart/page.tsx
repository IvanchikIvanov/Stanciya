'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/core/ui/Logo';
import { NetworkBanner } from '@/core/ui/NetworkBanner';
import {
  buildCartLineKey,
  type CartLineItem,
  readCartFromStorage,
  useCart,
} from '@/modules/coffee/catalog/cart-store';

export default function CartPage() {
  const router = useRouter();
  const cart = useCart();

  const [verifying, setVerifying] = useState(true);
  const [verifyError, setVerifyError] = useState(false);
  const [priceUpdatedNotice, setPriceUpdatedNotice] = useState(false);
  const [hasUnavailable, setHasUnavailable] = useState(false);

  const verifyWithServer = useCallback(async () => {
    const rawItems = readCartFromStorage();
    if (rawItems.length === 0) {
      setVerifying(false);
      setHasUnavailable(false);
      return;
    }

    setVerifying(true);
    setVerifyError(false);
    try {
      const res = await fetch('/api/coffee/cart/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: rawItems.map((i) => ({
            productId: i.productId,
            optionIds: i.optionIds,
            quantity: i.quantity,
            clientUnitPrice: i.unitPrice,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error('Verify failed');
      }

      const data = await res.json();
      if (data.hasPriceChanges) {
        setPriceUpdatedNotice(true);
      }
      setHasUnavailable(Boolean(data.hasUnavailable));

      const nextItems: CartLineItem[] = rawItems.map((oldItem, idx) => {
        const checked = data.items?.[idx];
        if (!checked) return oldItem;
        return {
          ...oldItem,
          key: buildCartLineKey(oldItem.productId, oldItem.optionIds),
          productName: checked.productName || oldItem.productName,
          unitPrice: checked.available ? checked.unitPrice : oldItem.unitPrice,
          available: checked.available,
        };
      });

      cart.replaceAll(nextItems);
    } catch {
      setVerifyError(true);
    } finally {
      setVerifying(false);
    }
  }, []);

  useEffect(() => {
    verifyWithServer();
  }, [verifyWithServer]);

  const anyUnavailableInState =
    hasUnavailable || cart.items.some((item) => item.available === false);

  return (
    <div className="min-h-screen bg-brand-surface flex flex-col">
      <NetworkBanner />

      <header className="bg-brand text-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo variant="light" subtitle="Корзина" />
          <Link
            href="/"
            className="px-3.5 py-2 rounded-btn bg-white/15 hover:bg-white/25 text-xs sm:text-sm font-bold transition"
          >
            ← В каталог
          </Link>
        </div>
      </header>

      <main className="max-w-3xl w-full mx-auto px-4 py-6 space-y-4 flex-1">
        <h1 className="text-2xl font-extrabold text-slate-900">Ваш заказ</h1>

        {priceUpdatedNotice && (
          <div
            role="status"
            className="p-3.5 rounded-btn bg-amber-50 border border-amber-300 text-amber-900 text-sm font-semibold"
          >
            Цены обновились. Итоговая сумма пересчитана по актуальному меню.
          </div>
        )}

        {verifyError && (
          <div
            role="alert"
            className="p-4 rounded-btn bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between gap-3"
          >
            <span>Не удалось сверить наличие с сервером.</span>
            <button
              type="button"
              onClick={verifyWithServer}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold text-xs"
            >
              Повторить
            </button>
          </div>
        )}

        {!cart.hydrated || verifying ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="bg-white rounded-card p-4 h-24 animate-pulse shadow-card"
              />
            ))}
          </div>
        ) : cart.items.length === 0 ? (
          <div className="bg-white rounded-panel p-8 text-center shadow-card space-y-4">
            <div className="text-lg font-extrabold text-slate-900">
              В корзине пока пусто
            </div>
            <p className="text-sm text-slate-600">
              Выберите напитки и свежую выпечку в каталоге.
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
            <div className="space-y-3">
              {cart.items.map((item) => {
                const isUnavailable = item.available === false;
                return (
                  <div
                    key={item.key}
                    className={`bg-white rounded-card p-4 shadow-card border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isUnavailable ? 'border-red-300 bg-red-50/30' : 'border-blue-50'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-slate-900 text-base">
                          {item.productName}
                        </span>
                        {isUnavailable && (
                          <span className="px-2.5 py-0.5 rounded-pill bg-red-100 text-red-700 text-xs font-extrabold">
                            Нет в наличии
                          </span>
                        )}
                      </div>
                      {item.modifiers.length > 0 && (
                        <div className="text-xs text-slate-600">
                          {item.modifiers
                            .map(
                              (m) =>
                                `${m.groupName}: ${m.optionName}${
                                  m.priceDelta > 0 ? ` (+${m.priceDelta} ₽)` : ''
                                }`
                            )
                            .join(' · ')}
                        </div>
                      )}
                      <div className="text-xs font-semibold text-slate-500">
                        {item.unitPrice} ₽ за шт.
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4">
                      {!isUnavailable && (
                        <div className="flex items-center bg-slate-100 rounded-btn p-1">
                          <button
                            type="button"
                            onClick={() => cart.setQuantity(item.key, item.quantity - 1)}
                            aria-label="Уменьшить количество"
                            className="w-9 h-9 rounded-lg font-bold text-slate-700 hover:bg-white"
                          >
                            −
                          </button>
                          <span className="w-8 text-center font-extrabold text-sm">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={item.quantity >= 20}
                            onClick={() => cart.setQuantity(item.key, item.quantity + 1)}
                            aria-label="Увеличить количество"
                            className="w-9 h-9 rounded-lg font-bold text-slate-700 disabled:opacity-40 hover:bg-white"
                          >
                            +
                          </button>
                        </div>
                      )}

                      <div className="text-right min-w-[75px]">
                        <div className="font-extrabold text-slate-900">
                          {isUnavailable ? '—' : `${item.unitPrice * item.quantity} ₽`}
                        </div>
                        <button
                          type="button"
                          onClick={() => cart.removeItem(item.key)}
                          className="text-xs text-red-600 hover:underline font-semibold mt-0.5"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {anyUnavailableInState && (
              <div
                role="alert"
                className="p-3.5 rounded-btn bg-red-50 border border-red-200 text-red-700 text-sm font-semibold"
              >
                Некоторые позиции в корзине закончились. Удалите их, чтобы продолжить оформление.
              </div>
            )}

            <div className="bg-white rounded-panel p-5 shadow-card border border-blue-100 space-y-4">
              <div className="flex items-center justify-between text-lg font-extrabold text-slate-900">
                <span>Итого к оплате на точке</span>
                <span>{cart.totalSum} ₽</span>
              </div>

              <button
                type="button"
                disabled={anyUnavailableInState || cart.items.length === 0}
                onClick={() => router.push('/checkout')}
                className="w-full min-h-[52px] py-3.5 px-6 rounded-btn bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-extrabold text-base transition shadow-sm"
              >
                Оформить заказ
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
