'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/core/ui/Logo';

export default function FindOrderPage() {
  const router = useRouter();

  const [number, setNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setGeneralError(null);
    setFieldErrors({});

    const code = number.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) {
      setFieldErrors({ number: 'Введите номер заказа, например K7M294' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/coffee/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: code }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data?.error?.fields) setFieldErrors(data.error.fields);
        setGeneralError(data?.error?.message || 'Не удалось найти заказ');
        return;
      }

      router.push(`/order/${data.accessKey}`);
    } catch {
      setGeneralError('Не удалось связаться с сервером. Проверьте соединение.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-surface flex flex-col">
      <header className="bg-white/90 backdrop-blur border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo variant="dark" subtitle="Поиск заказа" />
          <Link
            href="/"
            className="px-3.5 py-2 rounded-btn border border-slate-300 bg-white text-slate-800 hover:border-brand hover:text-brand text-xs sm:text-sm font-bold transition"
          >
            ← В каталог
          </Link>
        </div>
      </header>

      <main className="max-w-3xl w-full mx-auto px-4 py-6 space-y-5 flex-1">
        <h1 className="text-2xl font-extrabold text-slate-900">Найти заказ</h1>
        <p className="text-sm text-slate-600 max-w-xl">
          Если вы оформили заказ без регистрации и потеряли ссылку, введите номер заказа —
          откроется страница статуса. Номер случайный, поэтому знают его только вы.
        </p>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white rounded-panel p-5 sm:p-6 shadow-card border border-blue-100 space-y-4 max-w-xl"
        >
          {generalError && (
            <div
              role="alert"
              className="p-3.5 rounded-btn bg-red-50 border border-red-200 text-red-800 text-sm font-semibold"
            >
              {generalError}
            </div>
          )}

          <div>
            <label
              htmlFor="find-order-number"
              className="block text-sm font-bold text-slate-700 mb-1.5"
            >
              Номер заказа *
            </label>
            <input
              id="find-order-number"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              value={number}
              onChange={(e) =>
                setNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16))
              }
              placeholder="Например, K7M294"
              className="w-full sm:max-w-xs px-4 py-3 rounded-btn border border-slate-300 text-sm text-slate-900 tracking-widest font-bold"
            />
            {fieldErrors.number && (
              <p className="text-xs text-red-600 font-semibold mt-1">{fieldErrors.number}</p>
            )}
            <p className="text-[11px] text-slate-500 mt-1">
              Номер показан на странице заказа сразу после оформления. Буквы латиницей,
              регистр не важен.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto min-h-[48px] py-3 px-8 rounded-btn bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-extrabold text-base transition shadow-sm"
          >
            {submitting ? 'Ищем заказ...' : 'Найти заказ'}
          </button>
        </form>

        <p className="text-xs text-slate-500 max-w-xl">
          Если вы регистрировались при оформлении, все заказы доступны в{' '}
          <Link href="/profile" className="text-brand font-bold underline">
            личном кабинете
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
