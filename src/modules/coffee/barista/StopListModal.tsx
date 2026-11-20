'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { StopListItemDto, StopListViewDto } from '../stoplist/service';

interface StopListModalProps {
  onClose: () => void;
  onChanged?: (stoppedCount: number) => void;
}

/** Стоп-лист точки: бариста снимает позицию с наличия только на своей точке. */
export function StopListModal({ onClose, onChanged }: StopListModalProps) {
  const [view, setView] = useState<StopListViewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/coffee/barista/stop-list', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Не удалось загрузить');
      setView(data);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function toggle(item: StopListItemDto) {
    if (busyId !== null) return;
    setBusyId(item.productId);
    setError(null);
    try {
      const res = await fetch('/api/coffee/barista/stop-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: item.productId, stopped: !item.stopped }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Не удалось сохранить, повторите');
      setView(data);
      onChanged?.(data.items.filter((i: StopListItemDto) => i.stopped).length);
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить, повторите');
    } finally {
      setBusyId(null);
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, StopListItemDto[]>();
    for (const it of view?.items ?? []) {
      const list = map.get(it.categoryName) ?? [];
      list.push(it);
      map.set(it.categoryName, list);
    }
    return Array.from(map.entries());
  }, [view]);

  const stoppedCount = view?.items.filter((i) => i.stopped).length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="stoplist-title"
    >
      <div
        className="bg-white rounded-panel shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h2 id="stoplist-title" className="text-xl font-extrabold text-slate-900">
              Стоп-лист точки
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {view ? `${view.pointName} · ` : ''}Отмеченные позиции гости не смогут заказать на этой
              точке. На другие точки это не влияет.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {error && (
            <div role="alert" className="p-3 rounded-btn bg-red-50 border border-red-200 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 rounded-btn bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : (
            groups.map(([category, items]) => (
              <section key={category} className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{category}</h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  {items.map((it) => {
                    const busy = busyId === it.productId;
                    return (
                      <button
                        key={it.productId}
                        type="button"
                        onClick={() => toggle(it)}
                        disabled={busy || it.globallyOutOfStock}
                        aria-pressed={it.stopped}
                        className={`min-h-[56px] px-4 rounded-btn border-2 flex items-center justify-between gap-3 text-left transition disabled:opacity-60 ${
                          it.stopped
                            ? 'border-red-300 bg-red-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className="font-bold text-sm text-slate-900">{it.productName}</span>
                        <span
                          className={`shrink-0 px-2.5 py-1 rounded-pill text-[11px] font-extrabold ${
                            it.globallyOutOfStock
                              ? 'bg-slate-200 text-slate-600'
                              : it.stopped
                              ? 'bg-red-600 text-white'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {busy
                            ? '…'
                            : it.globallyOutOfStock
                            ? 'Нет во всей сети'
                            : it.stopped
                            ? 'Нет в наличии'
                            : 'В наличии'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-slate-700">
            В стоп-листе: {stoppedCount}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[46px] px-5 rounded-btn bg-brand hover:bg-brand-dark text-white font-extrabold text-sm"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
