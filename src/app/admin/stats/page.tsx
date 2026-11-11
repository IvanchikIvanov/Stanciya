'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { PointDto } from '@/core/points/service';
import type { ModuleStatsBlockData } from '@/core/types';

export default function AdminStatsPage() {
  const [blocks, setBlocks] = useState<ModuleStatsBlockData[]>([]);
  const [points, setPoints] = useState<PointDto[]>([]);
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'custom'>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pointId, setPointId] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      sp.set('period', period);
      if (period === 'custom' && from) sp.set('from', from);
      if (period === 'custom' && to) sp.set('to', to);
      if (pointId) sp.set('pointId', pointId);

      const res = await fetch(`/api/core/admin/stats?${sp.toString()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setBlocks(data.blocks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [period, from, to, pointId]);

  useEffect(() => {
    fetch('/api/core/admin/points', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.points) setPoints(d.points);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Показатели</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Сводная статистика предзаказов по подключённым модулям платформы
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={pointId}
            onChange={(e) => setPointId(e.target.value)}
            className="px-3.5 py-2 rounded-btn border border-slate-300 bg-white text-sm font-semibold"
          >
            <option value="">Все точки</option>
            {points.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>

          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            className="px-3.5 py-2 rounded-btn border border-slate-300 bg-white text-sm font-semibold"
          >
            <option value="today">Сегодня</option>
            <option value="7d">7 дней</option>
            <option value="30d">30 дней</option>
            <option value="custom">Произвольный период</option>
          </select>
        </div>
      </div>

      {period === 'custom' && (
        <div className="bg-white rounded-panel p-4 shadow-card border border-blue-50 flex flex-wrap items-center gap-4 text-xs font-bold">
          <label>
            С:{' '}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="ml-1 px-2.5 py-1.5 rounded border border-slate-300"
            />
          </label>
          <label>
            По:{' '}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="ml-1 px-2.5 py-1.5 rounded border border-slate-300"
            />
          </label>
        </div>
      )}

      {loading ? (
        <div className="h-64 bg-white rounded-panel animate-pulse" />
      ) : (
        blocks.map((block) => (
          <section
            key={block.moduleId}
            className="bg-white rounded-panel p-6 shadow-card border border-blue-50 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-slate-900">
                Модуль: {block.moduleTitle}
              </h2>
              {block.disclaimer && (
                <span className="px-3 py-1 rounded-pill bg-amber-100 text-amber-900 text-xs font-bold">
                  {block.disclaimer}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              {block.metrics.map((m) => (
                <div
                  key={m.id}
                  className="p-4 rounded-card bg-brand-surface border border-blue-100"
                >
                  <div className="text-xs font-bold text-slate-500">{m.label}</div>
                  <div className="text-2xl font-extrabold text-slate-900 mt-1">
                    {m.value}
                  </div>
                </div>
              ))}
            </div>

            {block.popularItems && (
              <div className="space-y-3">
                <h3 className="text-sm font-extrabold text-slate-800">
                  {block.popularItemsTitle || '10 популярных позиций'}
                </h3>
                {block.popularItems.length === 0 ? (
                  <div className="text-xs text-slate-500">
                    За выбранный период нет выданных заказов.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                          <th className="py-2 pr-3">#</th>
                          <th className="py-2 px-3">Позиция</th>
                          <th className="py-2 px-3">Количество (шт.)</th>
                          <th className="py-2 pl-3 text-right">Сумма (₽)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {block.popularItems.map((item, idx) => (
                          <tr key={item.id}>
                            <td className="py-2.5 pr-3 font-bold text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              {item.name}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">
                              {item.quantity}
                            </td>
                            <td className="py-2.5 pl-3 text-right font-extrabold text-slate-900">
                              {item.revenue} ₽
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
