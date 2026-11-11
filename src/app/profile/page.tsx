'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/core/ui/Logo';
import { NetworkBanner } from '@/core/ui/NetworkBanner';
import type { GuestOrderDto } from '@/modules/coffee/orders/service';

export default function ClientProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<{
    id: number;
    name: string;
    phone: string | null;
    role: string;
  } | null>(null);
  const [orders, setOrders] = useState<GuestOrderDto[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passMsg, setPassMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [savingPass, setSavingPass] = useState(false);

  const loadProfileData = useCallback(async () => {
    setLoading(true);
    try {
      const meRes = await fetch('/api/core/auth/me', { cache: 'no-store' });
      const meData = await meRes.json();

      if (!meData?.user) {
        router.push('/login');
        return;
      }

      if (meData.user.role !== 'client') {
        router.push(meData.user.role === 'admin' ? '/admin' : '/barista');
        return;
      }

      setUser(meData.user);
      setName(meData.user.name || '');
      setPhone(meData.user.phone || '');

      const ordRes = await fetch('/api/coffee/profile/orders', { cache: 'no-store' });
      if (ordRes.ok) {
        const ordData = await ordRes.json();
        setOrders(ordData.orders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      const res = await fetch('/api/core/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileMsg({
          type: 'err',
          text: data?.error?.message || 'Не удалось обновить профиль',
        });
        return;
      }
      setName(data.user.name);
      setPhone(data.user.phone);
      setProfileMsg({ type: 'ok', text: 'Данные профиля сохранены' });
    } catch {
      setProfileMsg({ type: 'err', text: 'Нет соединения с сервером' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassMsg(null);
    setSavingPass(true);
    try {
      const res = await fetch('/api/core/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPassMsg({
          type: 'err',
          text: data?.error?.message || 'Ошибка при смене пароля',
        });
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setPassMsg({ type: 'ok', text: 'Пароль успешно изменён' });
    } catch {
      setPassMsg({ type: 'err', text: 'Нет соединения с сервером' });
    } finally {
      setSavingPass(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/core/auth/logout', { method: 'POST' });
    // Выход не очищает корзину в localStorage
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-brand-surface flex flex-col pb-12">
      <NetworkBanner />

      <header className="bg-brand text-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo variant="light" subtitle="Личный кабинет" />
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="px-3.5 py-2 rounded-btn bg-white/15 hover:bg-white/25 text-xs sm:text-sm font-bold transition"
            >
              В каталог
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="px-3.5 py-2 rounded-btn bg-red-500/80 hover:bg-red-600 text-xs sm:text-sm font-bold transition"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl w-full mx-auto px-4 py-6 space-y-6 flex-1">
        {loading || !user ? (
          <div className="space-y-4">
            <div className="h-44 bg-white rounded-panel animate-pulse" />
            <div className="h-64 bg-white rounded-panel animate-pulse" />
          </div>
        ) : (
          <>
            {/* История заказов */}
            <section className="bg-white rounded-panel p-6 shadow-card border border-blue-100 space-y-4">
              <h1 className="text-xl font-extrabold text-slate-900">
                Мои заказы
              </h1>

              {orders.length === 0 ? (
                <div className="py-8 text-center space-y-3">
                  <div className="text-base font-bold text-slate-700">
                    Вы ещё ничего не заказывали
                  </div>
                  <Link
                    href="/"
                    className="inline-block px-5 py-2.5 rounded-btn bg-brand text-white font-bold text-sm"
                  >
                    Перейти в каталог
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((ord) => {
                    const isActive = ['new', 'accepted', 'cooking', 'ready'].includes(
                      ord.status
                    );
                    return (
                      <Link
                        key={ord.accessKey}
                        href={`/order/${ord.accessKey}`}
                        className={`block p-4 rounded-card border transition hover:shadow-md ${
                          isActive
                            ? 'bg-brand-surface border-brand/40'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="font-extrabold text-slate-900 text-base">
                              Заказ №{ord.number}
                            </span>
                            {isActive && (
                              <span className="px-2 py-0.5 rounded-pill bg-brand text-white text-[11px] font-bold">
                                Активный
                              </span>
                            )}
                          </div>
                          <span
                            className={`px-3 py-1 rounded-pill text-xs font-extrabold ${
                              ord.status === 'cancelled'
                                ? 'bg-red-100 text-red-700'
                                : ord.status === 'ready'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ord.status === 'done'
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-blue-100 text-brand-deep'
                            }`}
                          >
                            {ord.statusLabel}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                          <span>
                            {ord.pointName} · К {ord.pickupTimeFormatted}
                          </span>
                          <span className="font-extrabold text-slate-900 text-sm">
                            {ord.total} ₽
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Личные данные и смена пароля */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="bg-white rounded-panel p-6 shadow-card border border-blue-50 space-y-4">
                <h2 className="text-lg font-extrabold text-slate-900">
                  Личные данные
                </h2>

                {profileMsg && (
                  <div
                    className={`p-3 rounded-btn text-xs font-bold ${
                      profileMsg.type === 'ok'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {profileMsg.text}
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="space-y-3">
                  <div>
                    <label
                      htmlFor="profile-name"
                      className="block text-xs font-bold text-slate-600 mb-1"
                    >
                      Имя
                    </label>
                    <input
                      id="profile-name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={40}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="profile-phone"
                      className="block text-xs font-bold text-slate-600 mb-1"
                    >
                      Телефон
                    </label>
                    <input
                      id="profile-phone"
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="px-5 py-2.5 rounded-btn bg-brand hover:bg-brand-dark text-white font-bold text-sm transition"
                  >
                    {savingProfile ? 'Сохраняем...' : 'Сохранить'}
                  </button>
                </form>
              </section>

              <section className="bg-white rounded-panel p-6 shadow-card border border-blue-50 space-y-4">
                <h2 className="text-lg font-extrabold text-slate-900">
                  Смена пароля
                </h2>

                {passMsg && (
                  <div
                    className={`p-3 rounded-btn text-xs font-bold ${
                      passMsg.type === 'ok'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {passMsg.text}
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="space-y-3">
                  <div>
                    <label
                      htmlFor="profile-curr-pass"
                      className="block text-xs font-bold text-slate-600 mb-1"
                    >
                      Текущий пароль
                    </label>
                    <input
                      id="profile-curr-pass"
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="profile-new-pass"
                      className="block text-xs font-bold text-slate-600 mb-1"
                    >
                      Новый пароль (от 8 символов)
                    </label>
                    <input
                      id="profile-new-pass"
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingPass}
                    className="px-5 py-2.5 rounded-btn bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm transition"
                  >
                    {savingPass ? 'Обновляем...' : 'Изменить пароль'}
                  </button>
                </form>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
