'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { SettingValue } from '@/core/types';
import { useUnsavedChangesWarning } from '@/core/ui/useUnsavedChanges';

type Draft = Record<string, string>;

function toDraft(settings: SettingValue[]): Draft {
  return Object.fromEntries(settings.map((s) => [s.key, String(s.value ?? '')]));
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingValue[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/core/admin/settings', { cache: 'no-store' });
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setSettings(data.settings ?? []);
      setDraft(toDraft(data.settings ?? []));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const original = useMemo(() => toDraft(settings), [settings]);
  const changedKeys = useMemo(
    () => Object.keys(draft).filter((k) => draft[k] !== original[k]),
    [draft, original]
  );
  const isDirty = changedKeys.length > 0;
  useUnsavedChangesWarning(isDirty);

  const groups = useMemo(() => {
    const map = new Map<string, SettingValue[]>();
    for (const s of settings) {
      const list = map.get(s.group) ?? [];
      list.push(s);
      map.set(s.group, list);
    }
    return Array.from(map.entries());
  }, [settings]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    setFieldErrors({});
    try {
      const values: Record<string, string | number> = {};
      for (const key of changedKeys) {
        const def = settings.find((s) => s.key === key);
        const raw = draft[key].trim();
        values[key] =
          def?.type === 'integer' && raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
      }
      const res = await fetch('/api/core/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(data?.error?.message ?? 'Не удалось сохранить, повторите');
        setFieldErrors(data?.error?.fields ?? {});
        return;
      }
      setSettings(data.settings ?? []);
      setDraft(toDraft(data.settings ?? []));
      setSavedAt(Date.now());
    } catch {
      setSaveError('Нет соединения. Изменения не сохранены, повторите');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Настройки</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Правила заказов и ссылки на главной. Новые значения действуют сразу после сохранения.
        </p>
      </div>

      {loading ? (
        <div className="h-64 bg-white rounded-panel animate-pulse" />
      ) : loadError ? (
        <div className="bg-white rounded-panel p-8 text-center space-y-3 shadow-card">
          <div className="font-extrabold text-slate-900">Не удалось загрузить</div>
          <button
            type="button"
            onClick={load}
            className="px-5 py-2.5 rounded-btn bg-brand text-white font-bold text-sm"
          >
            Повторить
          </button>
        </div>
      ) : (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (isDirty && !saving) save();
          }}
        >
          {groups.map(([group, items]) => (
            <section
              key={group}
              className="bg-white rounded-panel p-6 shadow-card border border-blue-50 space-y-5"
            >
              <h2 className="text-lg font-extrabold text-slate-900">{group}</h2>
              {items.map((s) => {
                const id = `setting-${s.key}`;
                const err = fieldErrors[s.key];
                return (
                  <div key={s.key} className="space-y-1.5">
                    <label htmlFor={id} className="block text-sm font-bold text-slate-800">
                      {s.label}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={id}
                        type={s.type === 'integer' ? 'number' : 'url'}
                        inputMode={s.type === 'integer' ? 'numeric' : 'url'}
                        min={s.min}
                        max={s.max}
                        step={1}
                        placeholder={s.type === 'url' ? 'https://' : undefined}
                        value={draft[s.key] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                        aria-invalid={Boolean(err)}
                        aria-describedby={s.hint ? `${id}-hint` : undefined}
                        className={`w-full ${
                          s.type === 'integer' ? 'max-w-[10rem]' : ''
                        } px-3.5 py-2.5 rounded-btn border bg-white text-sm ${
                          err ? 'border-red-500' : 'border-slate-300'
                        }`}
                      />
                      {s.unit && <span className="text-sm font-bold text-slate-600">{s.unit}</span>}
                    </div>
                    {err && <p className="text-xs font-semibold text-red-600">{err}</p>}
                    {s.hint && (
                      <p id={`${id}-hint`} className="text-xs text-slate-500">
                        {s.hint}
                      </p>
                    )}
                  </div>
                );
              })}
            </section>
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!isDirty || saving}
              className="px-5 py-2.5 rounded-btn bg-brand hover:bg-brand-dark text-white font-bold text-sm transition disabled:opacity-50"
            >
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
            {isDirty && !saving && (
              <button
                type="button"
                onClick={() => {
                  setDraft(original);
                  setFieldErrors({});
                  setSaveError(null);
                }}
                className="px-5 py-2.5 rounded-btn border border-slate-300 bg-white font-bold text-sm"
              >
                Отменить изменения
              </button>
            )}
            {saveError && <span className="text-sm font-semibold text-red-600">{saveError}</span>}
            {!isDirty && savedAt && !saveError && (
              <span className="text-sm font-semibold text-emerald-700">Сохранено</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
