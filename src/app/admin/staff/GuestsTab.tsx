'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { formatPhoneDisplay } from '@/core/phone';
import { formatMiassDateTime } from '@/core/time';
import type { ClientListItem } from '@/core/types';

interface GuestsTabProps {
  onResetPassword: (target: { id: number; label: string }) => void;
}

/** Вкладка «Гости»: зарегистрированные клиенты со статистикой заказов и сбросом пароля. */
export function GuestsTab({ onResetPassword }: GuestsTabProps) {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const sp = new URLSearchParams({ page: String(page) });
      if (appliedSearch) sp.set('search', appliedSearch);
      const res = await fetch(`/api/core/admin/clients?${sp}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setClients(data.clients ?? []);
      setTotalCount(data.totalCount ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [page, appliedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  // Поиск применяется через полсекунды после ввода
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setAppliedSearch(search.trim());
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <section className="bg-white rounded-panel p-5 shadow-card border border-blue-50 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-extrabold text-slate-900">
          Зарегистрированные гости ({totalCount})
        </h2>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени или телефону"
          aria-label="Поиск гостя"
          className="w-full sm:w-72 px-3.5 py-2 rounded-btn border border-slate-300 text-sm"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-11 rounded-btn bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : loadError ? (
        <div className="py-6 text-center space-y-3">
          <div className="font-extrabold text-slate-900">Не удалось загрузить</div>
          <button
            type="button"
            onClick={load}
            className="px-5 py-2.5 rounded-btn bg-brand text-white font-bold text-sm"
          >
            Повторить
          </button>
        </div>
      ) : clients.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">
          {appliedSearch ? 'Никого не нашли' : 'Пока никто не зарегистрировался'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2.5 pr-3">Гость</th>
                <th className="py-2.5 px-3">Регистрация</th>
                <th className="py-2.5 px-3 text-right">Заказов</th>
                <th className="py-2.5 px-3 text-right">Выдано</th>
                <th className="py-2.5 px-3 text-right">Сумма выданных</th>
                <th className="py-2.5 px-3">Последний заказ</th>
                <th className="py-2.5 pl-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="py-3 pr-3">
                    <div className="font-extrabold text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {c.phone ? formatPhoneDisplay(c.phone) : '—'}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-xs text-slate-700 whitespace-nowrap">
                    {formatMiassDateTime(c.registeredAt)}
                  </td>
                  <td className="py-3 px-3 text-right font-bold">{c.ordersCount}</td>
                  <td className="py-3 px-3 text-right font-bold">{c.doneCount}</td>
                  <td className="py-3 px-3 text-right font-extrabold whitespace-nowrap">
                    {c.doneSum.toLocaleString('ru-RU')} ₽
                  </td>
                  <td className="py-3 px-3 text-xs text-slate-700 whitespace-nowrap">
                    {c.lastOrderAt ? formatMiassDateTime(c.lastOrderAt) : '—'}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        onResetPassword({ id: c.id, label: `${c.name} (${c.phone ?? 'без телефона'})` })
                      }
                      className="text-xs font-bold text-amber-700 hover:underline whitespace-nowrap"
                    >
                      Сбросить пароль
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
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

      <p className="text-[11px] text-slate-500">
        Сумма — по выданным заказам (оплачены на точке). Заказы, оформленные до регистрации, сюда не
        входят.
      </p>
    </section>
  );
}
