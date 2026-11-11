'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/core/ui/Logo';

export default function StaffLoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/core/auth/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message || 'Ошибка входа');
        return;
      }
      if (data.user?.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/barista');
      }
      router.refresh();
    } catch {
      setError('Нет соединения с сервером. Повторите попытку.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-surface flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-panel shadow-card p-6 sm:p-8 border border-blue-100">
        <div className="flex flex-col items-center text-center mb-6">
          <Logo variant="dark" subtitle="Служебный вход" />
          <h1 className="text-xl font-extrabold text-slate-900 mt-4">
            Вход для сотрудников
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Панель бариста и управление сетью «СТАНЦИЯ»
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3.5 rounded-btn bg-red-50 border border-red-200 text-red-700 text-sm font-medium"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="staff-login"
              className="block text-sm font-bold text-slate-700 mb-1.5"
            >
              Логин сотрудника
            </label>
            <input
              id="staff-login"
              type="text"
              autoComplete="username"
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="w-full px-4 py-3 rounded-btn border border-slate-300 focus:border-brand text-slate-900 text-sm"
              placeholder="Введите логин"
            />
          </div>

          <div>
            <label
              htmlFor="staff-password"
              className="block text-sm font-bold text-slate-700 mb-1.5"
            >
              Пароль
            </label>
            <input
              id="staff-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-btn border border-slate-300 focus:border-brand text-slate-900 text-sm"
              placeholder="Введите пароль"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] py-3 px-4 rounded-btn bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-bold text-sm transition shadow-sm"
          >
            {loading ? 'Входим...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
