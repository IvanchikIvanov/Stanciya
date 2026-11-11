'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { PointDto } from '@/core/points/service';
import type { StaffMemberDto } from '@/core/users/service';
import { useUnsavedChangesWarning } from '@/core/ui/useUnsavedChanges';

export default function AdminStaffPage() {
  const [staff, setStaff] = useState<StaffMemberDto[]>([]);
  const [clients, setClients] = useState<
    Array<{ id: number; name: string; phone: string | null; isActive: boolean }>
  >([]);
  const [points, setPoints] = useState<PointDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Форма сотрудника
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'barista' | 'admin'>('barista');
  const [pointId, setPointId] = useState<number | ''>('');
  const [isActive, setIsActive] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Сброс пароля сотруднику или клиенту
  const [resetTarget, setResetTarget] = useState<{ id: number; label: string } | null>(
    null
  );
  const [resetNewPass, setResetNewPass] = useState('');

  useUnsavedChangesWarning(isDirty);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRes, ptsRes] = await Promise.all([
        fetch('/api/core/admin/staff', { cache: 'no-store' }),
        fetch('/api/core/admin/points', { cache: 'no-store' }),
      ]);
      if (staffRes.ok) {
        const sData = await staffRes.json();
        setStaff(sData.staff ?? []);
        setClients(sData.clients ?? []);
      }
      if (ptsRes.ok) {
        const pData = await ptsRes.json();
        setPoints(pData.points ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openNewStaff() {
    setEditingId('new');
    setName('');
    setLogin('');
    setPassword('');
    setRole('barista');
    setPointId(points[0]?.id ?? '');
    setIsActive(true);
    setIsDirty(false);
  }

  function openEditStaff(m: StaffMemberDto) {
    setEditingId(m.id);
    setName(m.name);
    setLogin(m.login || '');
    setPassword('');
    setRole((m.role as 'barista' | 'admin') || 'barista');
    setPointId(m.pointId ?? '');
    setIsActive(m.isActive);
    setIsDirty(false);
  }

  async function handleSaveStaff(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    if (role === 'barista' && !pointId) {
      setFeedback({ type: 'err', text: 'Для бариста необходимо выбрать точку' });
      return;
    }

    setSaving(true);
    try {
      if (editingId === 'new') {
        const res = await fetch('/api/core/admin/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            login: login.trim(),
            password,
            role,
            pointId: role === 'barista' ? Number(pointId) : pointId ? Number(pointId) : null,
            isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFeedback({
            type: 'err',
            text: data?.error?.message || 'Ошибка при создании сотрудника',
          });
          return;
        }
      } else {
        const res = await fetch(`/api/core/admin/staff/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            login: login.trim(),
            role,
            pointId: role === 'barista' ? Number(pointId) : pointId ? Number(pointId) : null,
            isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFeedback({
            type: 'err',
            text: data?.error?.message || 'Ошибка при сохранении сотрудника',
          });
          return;
        }
      }

      setIsDirty(false);
      setEditingId(null);
      setFeedback({ type: 'ok', text: 'Данные сотрудника сохранены' });
      await loadData();
    } catch {
      setFeedback({ type: 'err', text: 'Ошибка сети' });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(m: StaffMemberDto) {
    setFeedback(null);
    try {
      const res = await fetch(`/api/core/admin/staff/${m.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: m.name,
          login: m.login || '',
          role: m.role,
          pointId: m.pointId,
          isActive: !m.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: 'err',
          text:
            data?.error?.message ||
            'Нельзя отключить или понизить единственного активного администратора',
        });
        return;
      }
      await loadData();
    } catch {
      setFeedback({ type: 'err', text: 'Ошибка сети' });
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/core/admin/users/${resetTarget.id}/reset-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: resetNewPass }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: 'err',
          text: data?.error?.message || 'Ошибка при сбросе пароля',
        });
        return;
      }
      setResetTarget(null);
      setResetNewPass('');
      setFeedback({
        type: 'ok',
        text: `Новый пароль для «${resetTarget.label}» установлен`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'Ошибка сети при сбросе пароля' });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Сотрудники и доступ
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Учётные записи бариста и администраторов, сброс паролей
          </p>
        </div>
        <button
          type="button"
          onClick={openNewStaff}
          className="px-4 py-2.5 rounded-btn bg-brand hover:bg-brand-dark text-white font-bold text-sm transition"
        >
          + Добавить сотрудника
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

      {resetTarget && (
        <form
          onSubmit={handleResetPassword}
          className="bg-white rounded-panel p-5 shadow-card border-2 border-amber-400 space-y-3"
        >
          <h2 className="text-base font-extrabold text-slate-900">
            Сброс пароля: {resetTarget.label}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="password"
              required
              minLength={6}
              value={resetNewPass}
              onChange={(e) => setResetNewPass(e.target.value)}
              placeholder="Новый пароль (от 6 символов)"
              className="px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm w-72"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-btn bg-brand text-white font-bold text-sm"
            >
              Установить пароль
            </button>
            <button
              type="button"
              onClick={() => {
                setResetTarget(null);
                setResetNewPass('');
              }}
              className="px-4 py-2.5 rounded-btn bg-slate-100 text-slate-700 font-bold text-sm"
            >
              Отмена
            </button>
          </div>
        </form>
      )}

      {editingId !== null && (
        <form
          onSubmit={handleSaveStaff}
          className="bg-white rounded-panel p-6 shadow-card border-2 border-brand space-y-4"
        >
          <h2 className="text-lg font-extrabold text-slate-900">
            {editingId === 'new' ? 'Новый сотрудник' : 'Редактирование сотрудника'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Имя *
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
                Логин *
              </label>
              <input
                type="text"
                required
                value={login}
                onChange={(e) => {
                  setLogin(e.target.value);
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
              />
            </div>

            {editingId === 'new' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Пароль *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setIsDirty(true);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Роль *
              </label>
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as 'barista' | 'admin');
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
              >
                <option value="barista">Бариста (barista)</option>
                <option value="admin">Администратор (admin)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Точка {role === 'barista' ? '*' : '(необязательно)'}
              </label>
              <select
                required={role === 'barista'}
                value={pointId}
                onChange={(e) => {
                  setPointId(e.target.value ? Number(e.target.value) : '');
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
              >
                <option value="">Не назначена</option>
                {points.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-800 pt-4">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => {
                  setIsActive(e.target.checked);
                  setIsDirty(true);
                }}
                className="w-4 h-4"
              />
              <span>Активен (доступ разрешён)</span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-btn bg-brand text-white font-bold text-sm"
            >
              {saving ? 'Сохраняем...' : 'Сохранить'}
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
      ) : (
        <>
          <section className="bg-white rounded-panel p-5 shadow-card border border-blue-50 space-y-4">
            <h2 className="text-base font-extrabold text-slate-900">
              Сотрудники ({staff.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2.5 pr-3">Имя</th>
                    <th className="py-2.5 px-3">Логин</th>
                    <th className="py-2.5 px-3">Роль</th>
                    <th className="py-2.5 px-3">Точка</th>
                    <th className="py-2.5 px-3">Статус</th>
                    <th className="py-2.5 pl-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staff.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-3 font-extrabold text-slate-900">
                        {m.name}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-slate-700">
                        {m.login}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-0.5 rounded-pill bg-brand-light text-brand-deep text-xs font-bold">
                          {m.role === 'admin' ? 'Администратор' : 'Бариста'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-700 text-xs">
                        {m.pointName || '—'}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(m)}
                          className={`px-2.5 py-1 rounded-pill text-xs font-extrabold ${
                            m.isActive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {m.isActive ? 'Активен' : 'Отключён'}
                        </button>
                      </td>
                      <td className="py-3 pl-3 text-right space-x-3 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => openEditStaff(m)}
                          className="text-brand hover:underline"
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setResetTarget({ id: m.id, label: `${m.name} (${m.login})` })
                          }
                          className="text-amber-700 hover:underline"
                        >
                          Сбросить пароль
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {clients.length > 0 && (
            <section className="bg-white rounded-panel p-5 shadow-card border border-blue-50 space-y-3">
              <h2 className="text-base font-extrabold text-slate-900">
                Зарегистрированные клиенты (сброс пароля по обращению)
              </h2>
              <div className="divide-y divide-slate-100 text-sm">
                {clients.map((c) => (
                  <div
                    key={c.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{c.name}</span>
                      <span className="text-xs text-slate-500 ml-2">{c.phone}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setResetTarget({ id: c.id, label: `${c.name} (${c.phone})` })
                      }
                      className="text-xs font-bold text-brand hover:underline"
                    >
                      Задать новый пароль
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
