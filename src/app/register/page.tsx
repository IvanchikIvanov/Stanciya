'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Logo } from '@/core/ui/Logo';
import { NetworkBanner } from '@/core/ui/NetworkBanner';

function ClientRegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const returnTo = searchParams.get('returnTo') || '/profile';
  const orderKey = searchParams.get('orderKey') || undefined;

  const [name, setName] = useState(searchParams.get('name') || '');
  const [phone, setPhone] = useState(searchParams.get('phone') || '+7 ');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [consent, setConsent] = useState(false);

  const [generalError, setGeneralError] = useState<string | null>(null);
  const [phoneAlreadyExists, setPhoneAlreadyExists] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent || loading) return;

    setGeneralError(null);
    setPhoneAlreadyExists(false);
    setFieldErrors({});
    setLoading(true);

    try {
      const res = await fetch('/api/core/auth/client/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone,
          password,
          passwordConfirm,
          consent,
          attachOrderAccessKey: orderKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error?.code === 'PHONE_ALREADY_EXISTS') {
          setPhoneAlreadyExists(true);
        }
        if (data?.error?.fields) {
          setFieldErrors(data.error.fields);
        }
        setGeneralError(data?.error?.message || 'Ошибка при регистрации');
        return;
      }

      router.push(returnTo);
      router.refresh();
    } catch {
      setGeneralError('Нет соединения с сервером. Повторите попытку.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md bg-white rounded-panel shadow-card p-6 sm:p-8 border border-blue-100">
      <div className="flex flex-col items-center text-center mb-6">
        <Logo variant="dark" subtitle="Регистрация" />
        <h1 className="text-xl font-extrabold text-slate-900 mt-4">
          Создание профиля
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Быстрое оформление заказов и история покупок
        </p>
      </div>

      {generalError && (
        <div
          role="alert"
          className="mb-4 p-3.5 rounded-btn bg-red-50 border border-red-200 text-red-700 text-sm font-semibold space-y-1.5"
        >
          <div>{generalError}</div>
          {phoneAlreadyExists && (
            <div>
              <Link
                href={`/login?phone=${encodeURIComponent(phone)}&returnTo=${encodeURIComponent(returnTo)}`}
                className="text-brand font-extrabold underline"
              >
                Войти в существующий аккаунт →
              </Link>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="reg-name"
            className="block text-sm font-bold text-slate-700 mb-1.5"
          >
            Имя *
          </label>
          <input
            id="reg-name"
            type="text"
            required
            minLength={2}
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ваше имя"
            className="w-full px-4 py-3 rounded-btn border border-slate-300 text-sm text-slate-900"
          />
          {fieldErrors.name && (
            <p className="text-xs text-red-600 font-semibold mt-1">
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="reg-phone"
            className="block text-sm font-bold text-slate-700 mb-1.5"
          >
            Телефон *
          </label>
          <input
            id="reg-phone"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 (900) 000-00-00"
            className="w-full px-4 py-3 rounded-btn border border-slate-300 text-sm text-slate-900"
          />
          {fieldErrors.phone && (
            <p className="text-xs text-red-600 font-semibold mt-1">
              {fieldErrors.phone}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="reg-password"
            className="block text-sm font-bold text-slate-700 mb-1.5"
          >
            Пароль (не менее 8 символов) *
          </label>
          <input
            id="reg-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Минимум 8 символов"
            className="w-full px-4 py-3 rounded-btn border border-slate-300 text-sm text-slate-900"
          />
          {fieldErrors.password && (
            <p className="text-xs text-red-600 font-semibold mt-1">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="reg-password-confirm"
            className="block text-sm font-bold text-slate-700 mb-1.5"
          >
            Повтор пароля *
          </label>
          <input
            id="reg-password-confirm"
            type="password"
            required
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder="Повторите пароль"
            className="w-full px-4 py-3 rounded-btn border border-slate-300 text-sm text-slate-900"
          />
          {fieldErrors.passwordConfirm && (
            <p className="text-xs text-red-600 font-semibold mt-1">
              {fieldErrors.passwordConfirm}
            </p>
          )}
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-slate-300 text-brand"
          />
          <span className="text-xs text-slate-700">
            Соглашаюсь на{' '}
            <Link href="/info/consent" target="_blank" className="text-brand font-bold underline">
              обработку персональных данных
            </Link>{' '}
            и с{' '}
            <Link href="/info/privacy" target="_blank" className="text-brand font-bold underline">
              политикой конфиденциальности
            </Link>
            .
          </span>
        </label>

        <button
          type="submit"
          disabled={!consent || loading}
          className="w-full min-h-[48px] py-3 px-4 rounded-btn bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-bold text-sm transition"
        >
          {loading ? 'Регистрируем...' : 'Зарегистрироваться'}
        </button>
      </form>

      <div className="mt-6 pt-4 border-t border-slate-100 text-center text-sm text-slate-600 space-y-2">
        <div>
          Уже есть аккаунт?{' '}
          <Link href="/login" className="text-brand font-bold underline">
            Войти
          </Link>
        </div>
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:underline">
            ← Вернуться в каталог
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ClientRegisterPage() {
  return (
    <div className="min-h-screen bg-brand-surface flex flex-col">
      <NetworkBanner />
      <div className="flex-1 flex items-center justify-center p-4">
        <Suspense
          fallback={
            <div className="w-full max-w-md h-96 bg-white rounded-panel animate-pulse" />
          }
        >
          <ClientRegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
