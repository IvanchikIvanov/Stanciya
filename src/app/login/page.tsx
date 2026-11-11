'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Logo } from '@/core/ui/Logo';
import { NetworkBanner } from '@/core/ui/NetworkBanner';

function ClientLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/profile';

  const [phone, setPhone] = useState(searchParams.get('phone') || '+7 ');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForgotHint, setShowForgotHint] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/core/auth/client/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message || 'Неверный телефон или пароль');
        return;
      }
      router.push(returnTo);
      router.refresh();
    } catch {
      setError('Нет соединения с сервером. Повторите попытку.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md bg-white rounded-panel shadow-card p-6 sm:p-8 border border-blue-100">
      <div className="flex flex-col items-center text-center mb-6">
        <Logo variant="dark" subtitle="Личный кабинет гостя" />
        <h1 className="text-xl font-extrabold text-slate-900 mt-4">
          Вход по номеру телефона
        </h1>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3.5 rounded-btn bg-red-50 border border-red-200 text-red-700 text-sm font-semibold"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="client-phone"
            className="block text-sm font-bold text-slate-700 mb-1.5"
          >
            Телефон
          </label>
          <input
            id="client-phone"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 (900) 000-00-00"
            className="w-full px-4 py-3 rounded-btn border border-slate-300 text-sm text-slate-900"
          />
        </div>

        <div>
          <label
            htmlFor="client-password"
            className="block text-sm font-bold text-slate-700 mb-1.5"
          >
            Пароль
          </label>
          <input
            id="client-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Введите пароль"
            className="w-full px-4 py-3 rounded-btn border border-slate-300 text-sm text-slate-900"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full min-h-[48px] py-3 px-4 rounded-btn bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-bold text-sm transition"
        >
          {loading ? 'Входим...' : 'Войти'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => setShowForgotHint((v) => !v)}
          className="text-xs text-slate-500 hover:text-brand underline font-semibold"
        >
          Забыли пароль?
        </button>
        {showForgotHint && (
          <div className="mt-2 p-3 rounded-btn bg-brand-surface text-xs text-slate-700 border border-blue-100">
            Обратитесь на точку или по телефону — администратор сбросит пароль.
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-100 text-center text-sm text-slate-600 space-y-2">
        <div>
          Ещё нет аккаунта?{' '}
          <Link href="/register" className="text-brand font-bold underline">
            Зарегистрироваться
          </Link>
        </div>
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:underline">
            ← Вернуться в каталог без входа
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ClientLoginPage() {
  return (
    <div className="min-h-screen bg-brand-surface flex flex-col">
      <NetworkBanner />
      <div className="flex-1 flex items-center justify-center p-4">
        <Suspense
          fallback={
            <div className="w-full max-w-md h-80 bg-white rounded-panel animate-pulse" />
          }
        >
          <ClientLoginForm />
        </Suspense>
      </div>
    </div>
  );
}
