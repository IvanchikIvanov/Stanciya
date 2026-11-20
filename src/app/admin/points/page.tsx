'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { PointDto, PointHourDto } from '@/core/points/service';
import { useUnsavedChangesWarning } from '@/core/ui/useUnsavedChanges';

const WEEKDAY_LABELS = [
  { weekday: 1, name: 'Понедельник' },
  { weekday: 2, name: 'Вторник' },
  { weekday: 3, name: 'Среда' },
  { weekday: 4, name: 'Четверг' },
  { weekday: 5, name: 'Пятница' },
  { weekday: 6, name: 'Суббота' },
  { weekday: 0, name: 'Воскресенье' },
];

export default function AdminPointsPage() {
  const [points, setPoints] = useState<PointDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('+7');
  const [prepMinutes, setPrepMinutes] = useState(10);
  const [slotStepMinutes, setSlotStepMinutes] = useState(5);
  const [acceptsOrders, setAcceptsOrders] = useState(true);
  const [isHidden, setIsHidden] = useState(false);
  const [hours, setHours] = useState<PointHourDto[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useUnsavedChangesWarning(isDirty);

  const loadPoints = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/core/admin/points', { cache: 'no-store' });
      if (!res.ok) throw new Error('Load error');
      const data = await res.json();
      setPoints(data.points ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPoints();
  }, [loadPoints]);

  function openNewPoint() {
    setEditingId('new');
    setName('');
    setAddress('г. Миасс, ');
    setPhone('+79000000000');
    setPrepMinutes(10);
    setSlotStepMinutes(5);
    setAcceptsOrders(true);
    setIsHidden(false);
    setHours(
      Array.from({ length: 7 }, (_, wd) => ({
        weekday: wd,
        opensAt: '08:00',
        closesAt: '21:00',
        isClosed: false,
      }))
    );
    setIsDirty(false);
  }

  function openEditPoint(pt: PointDto) {
    setEditingId(pt.id);
    setName(pt.name);
    setAddress(pt.address);
    setPhone(pt.phone);
    setPrepMinutes(pt.prepMinutes);
    setSlotStepMinutes(pt.slotStepMinutes);
    setAcceptsOrders(pt.acceptsOrders);
    setIsHidden(pt.isHidden);
    setHours(pt.hours);
    setIsDirty(false);
  }

  function updateDayHour(weekday: number, patch: Partial<PointHourDto>) {
    setIsDirty(true);
    setHours((prev) =>
      prev.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h))
    );
  }

  async function handleSavePoint(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      const url =
        editingId === 'new'
          ? '/api/core/admin/points'
          : `/api/core/admin/points/${editingId}`;
      const method = editingId === 'new' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim(),
          phone: phone.trim(),
          prepMinutes: Number(prepMinutes),
          slotStepMinutes: Number(slotStepMinutes),
          acceptsOrders,
          isHidden,
          services: ['coffee'],
          hours,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: 'err',
          text: data?.error?.message || 'Ошибка при сохранении точки',
        });
        return;
      }
      setIsDirty(false);
      setEditingId(null);
      setFeedback({ type: 'ok', text: 'Настройки точки сохранены' });
      await loadPoints();
    } catch {
      setFeedback({ type: 'err', text: 'Ошибка сети при сохранении точки' });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleAcceptsOrders(pt: PointDto) {
    setFeedback(null);
    try {
      const res = await fetch(`/api/core/admin/points/${pt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pt.name,
          address: pt.address,
          phone: pt.phone,
          prepMinutes: pt.prepMinutes,
          slotStepMinutes: pt.slotStepMinutes,
          acceptsOrders: !pt.acceptsOrders,
          isHidden: pt.isHidden,
          services: pt.services,
          hours: pt.hours,
        }),
      });
      if (res.ok) {
        await loadPoints();
      }
    } catch {
      setFeedback({ type: 'err', text: 'Не удалось обновить статус точки' });
    }
  }

  async function handleDeletePoint(pt: PointDto) {
    if (!window.confirm(`Удалить точку «${pt.name}»?`)) return;
    setFeedback(null);
    try {
      const res = await fetch(`/api/core/admin/points/${pt.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: 'err',
          text:
            data?.error?.message ||
            'Точку с заказами удалить нельзя, только выключить и скрыть',
        });
        return;
      }
      setFeedback({ type: 'ok', text: 'Точка удалена' });
      await loadPoints();
    } catch {
      setFeedback({ type: 'err', text: 'Ошибка сети при удалении точки' });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Точки самовывоза
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Адреса, расписание по дням недели, шаг слотов и приём предзаказов
          </p>
        </div>
        <button
          type="button"
          onClick={openNewPoint}
          className="px-4 py-2.5 rounded-btn bg-brand hover:bg-brand-dark text-white font-bold text-sm transition"
        >
          + Добавить точку
        </button>
      </div>

      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-btn text-sm font-bold ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {editingId !== null && (
        <form
          onSubmit={handleSavePoint}
          className="bg-white rounded-panel p-6 shadow-card border-2 border-brand space-y-5"
        >
          <h2 className="text-lg font-extrabold text-slate-900">
            {editingId === 'new' ? 'Новая точка' : 'Редактирование точки'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Название *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Адрес *
              </label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Телефон *
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Время подготовки (мин.)
              </label>
              <input
                type="number"
                min={1}
                max={180}
                required
                value={prepMinutes}
                onChange={(e) => {
                  setPrepMinutes(Number(e.target.value));
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Шаг слотов (мин.)
              </label>
              <input
                type="number"
                min={5}
                max={60}
                required
                value={slotStepMinutes}
                onChange={(e) => {
                  setSlotStepMinutes(Number(e.target.value));
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-800 pt-4">
              <input
                type="checkbox"
                checked={acceptsOrders}
                onChange={(e) => {
                  setAcceptsOrders(e.target.checked);
                  setIsDirty(true);
                }}
                className="w-4 h-4"
              />
              <span>Принимает заказы</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-800 pt-4">
              <input
                type="checkbox"
                checked={isHidden}
                onChange={(e) => {
                  setIsHidden(e.target.checked);
                  setIsDirty(true);
                }}
                className="w-4 h-4"
              />
              <span>Скрыть с витрины</span>
            </label>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase text-slate-500">
              Часы работы по дням недели (местное время Миасса)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {WEEKDAY_LABELS.map(({ weekday, name: dayName }) => {
                const h = hours.find((item) => item.weekday === weekday) ?? {
                  weekday,
                  opensAt: '08:00',
                  closesAt: '21:00',
                  isClosed: false,
                };
                return (
                  <div
                    key={weekday}
                    className="p-3 rounded-btn bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="font-bold text-slate-800 w-28">{dayName}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        disabled={h.isClosed}
                        value={h.opensAt}
                        onChange={(e) =>
                          updateDayHour(weekday, { opensAt: e.target.value })
                        }
                        className="px-2 py-1 rounded border border-slate-300 bg-white disabled:opacity-40"
                      />
                      <span>—</span>
                      <input
                        type="time"
                        disabled={h.isClosed}
                        value={h.closesAt}
                        onChange={(e) =>
                          updateDayHour(weekday, { closesAt: e.target.value })
                        }
                        className="px-2 py-1 rounded border border-slate-300 bg-white disabled:opacity-40"
                      />
                    </div>
                    <label className="flex items-center gap-1 font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={h.isClosed}
                        onChange={(e) =>
                          updateDayHour(weekday, { isClosed: e.target.checked })
                        }
                      />
                      <span>Вых.</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-btn bg-brand text-white font-bold text-sm"
            >
              {saving ? 'Сохраняем...' : 'Сохранить точку'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (isDirty && !window.confirm('Отменить несохранённые изменения?')) {
                  return;
                }
                setIsDirty(false);
                setEditingId(null);
              }}
              className="px-4 py-2.5 rounded-btn bg-slate-100 text-slate-700 font-bold text-sm"
            >
              Отмена
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="h-48 bg-white rounded-panel animate-pulse" />
      ) : loadError ? (
        <div className="bg-white rounded-panel p-8 text-center space-y-3 shadow-card">
          <div className="font-extrabold text-slate-900">Не удалось загрузить</div>
          <button
            type="button"
            onClick={loadPoints}
            className="px-5 py-2.5 rounded-btn bg-brand text-white font-bold text-sm"
          >
            Повторить
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {points.map((pt) => (
            <div
              key={pt.id}
              className="bg-white rounded-panel p-5 shadow-card border border-blue-50 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">
                      {pt.name}
                    </h2>
                    <div className="text-xs text-slate-600">{pt.address}</div>
                    <div className="text-xs font-bold text-brand mt-0.5">
                      {pt.phone}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleAcceptsOrders(pt)}
                      className={`px-3 py-1 rounded-pill text-xs font-extrabold ${
                        pt.acceptsOrders
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {pt.acceptsOrders ? 'Принимает заказы' : 'Приём выключен'}
                    </button>
                    {pt.isHidden && (
                      <span className="px-2.5 py-0.5 rounded-pill bg-slate-200 text-slate-700 text-[11px] font-bold">
                        Скрыта с витрины
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-slate-600 pt-1">
                  Подготовка: <b>{pt.prepMinutes} мин.</b> · Шаг слотов:{' '}
                  <b>{pt.slotStepMinutes} мин.</b>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
                <button
                  type="button"
                  onClick={() => openEditPoint(pt)}
                  className="text-brand hover:underline"
                >
                  Редактировать и часы работы
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePoint(pt)}
                  className="text-red-600 hover:underline"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
