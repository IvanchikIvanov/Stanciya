'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useUnsavedChangesWarning } from '@/core/ui/useUnsavedChanges';
import type {
  AdminModifierGroupDto,
  UpsertModifierOptionInput,
} from '@/modules/coffee/admin/service';

export default function AdminModifiersPage() {
  const [groups, setGroups] = useState<AdminModifierGroupDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [name, setName] = useState('');
  const [selectType, setSelectType] = useState<'single' | 'multiple'>('single');
  const [isRequired, setIsRequired] = useState(true);
  const [options, setOptions] = useState<UpsertModifierOptionInput[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useUnsavedChangesWarning(isDirty);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/coffee/admin/modifiers', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  function openNewGroup() {
    setEditingId('new');
    setName('');
    setSelectType('single');
    setIsRequired(true);
    setOptions([
      { name: 'Стандарт', priceDelta: 0, isAvailable: true, isDefault: true, sortOrder: 10 },
    ]);
    setIsDirty(false);
  }

  function openEditGroup(grp: AdminModifierGroupDto) {
    setEditingId(grp.id);
    setName(grp.name);
    setSelectType(grp.selectType);
    setIsRequired(grp.isRequired);
    setOptions(
      grp.options.map((o) => ({
        id: o.id,
        name: o.name,
        priceDelta: o.priceDelta,
        isAvailable: o.isAvailable,
        isDefault: o.isDefault,
        sortOrder: o.sortOrder,
      }))
    );
    setIsDirty(false);
  }

  function updateOption(idx: number, patch: Partial<UpsertModifierOptionInput>) {
    setIsDirty(true);
    setOptions((prev) =>
      prev.map((opt, i) => {
        if (i === idx) {
          return { ...opt, ...patch };
        }
        if (selectType === 'single' && patch.isDefault === true) {
          return { ...opt, isDefault: false };
        }
        return opt;
      })
    );
  }

  async function handleSaveGroup(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      const url =
        editingId === 'new'
          ? '/api/coffee/admin/modifiers'
          : `/api/coffee/admin/modifiers/${editingId}`;
      const method = editingId === 'new' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          selectType,
          isRequired,
          options,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: 'err',
          text:
            data?.error?.message ||
            'Обязательную группу без варианта по умолчанию сохранить нельзя',
        });
        return;
      }
      setIsDirty(false);
      setEditingId(null);
      setFeedback({ type: 'ok', text: 'Группа модификаторов сохранена' });
      await loadGroups();
    } catch {
      setFeedback({ type: 'err', text: 'Ошибка сети при сохранении группы' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGroup(grp: AdminModifierGroupDto) {
    const attachedNames = grp.attachedProducts.map((p) => p.name).join(', ');
    const confirmMsg =
      grp.attachedProducts.length > 0
        ? `Внимание! Группа «${grp.name}» привязана к товарам (${grp.attachedProducts.length}): ${attachedNames}.\n\nВы действительно хотите удалить эту группу модификаторов?`
        : `Удалить группу модификаторов «${grp.name}»?`;

    if (!window.confirm(confirmMsg)) return;

    setFeedback(null);
    try {
      const res = await fetch(`/api/coffee/admin/modifiers/${grp.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setFeedback({ type: 'ok', text: 'Группа модификаторов удалена' });
        await loadGroups();
      }
    } catch {
      setFeedback({ type: 'err', text: 'Не удалось удалить группу модификаторов' });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Группы модификаторов
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Объём, молоко, сиропы и дополнительные опции к напиткам
          </p>
        </div>
        <button
          type="button"
          onClick={openNewGroup}
          className="px-4 py-2.5 rounded-btn bg-brand hover:bg-brand-dark text-white font-bold text-sm transition"
        >
          + Новая группа
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
          onSubmit={handleSaveGroup}
          className="bg-white rounded-panel p-6 shadow-card border-2 border-brand space-y-4"
        >
          <h2 className="text-lg font-extrabold text-slate-900">
            {editingId === 'new'
              ? 'Создание группы модификаторов'
              : 'Редактирование группы модификаторов'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Название группы *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Например: Объём"
                className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Тип выбора
              </label>
              <select
                value={selectType}
                onChange={(e) => {
                  setSelectType(e.target.value as 'single' | 'multiple');
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
              >
                <option value="single">Одиночный (single)</option>
                <option value="multiple">Множественный (multiple)</option>
              </select>
            </div>

            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => {
                    setIsRequired(e.target.checked);
                    setIsDirty(true);
                  }}
                  className="w-4 h-4"
                />
                <span>Обязательная группа</span>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-slate-500">
                Варианты в группе
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsDirty(true);
                  setOptions((prev) => [
                    ...prev,
                    {
                      name: '',
                      priceDelta: 0,
                      isAvailable: true,
                      isDefault: false,
                      sortOrder: (prev.length + 1) * 10,
                    },
                  ]);
                }}
                className="text-xs font-bold text-brand hover:underline"
              >
                + Добавить вариант
              </button>
            </div>

            {options.map((opt, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center p-3 rounded-btn bg-slate-50 border border-slate-200"
              >
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    required
                    value={opt.name}
                    onChange={(e) => updateOption(idx, { name: e.target.value })}
                    placeholder="Название варианта"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  />
                </div>
                <div className="sm:col-span-3 flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">Доплата ₽:</span>
                  <input
                    type="number"
                    min={0}
                    required
                    value={opt.priceDelta}
                    onChange={(e) =>
                      updateOption(idx, { priceDelta: Number(e.target.value) })
                    }
                    className="w-24 px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={opt.isDefault}
                      onChange={(e) =>
                        updateOption(idx, { isDefault: e.target.checked })
                      }
                    />
                    <span>По умолч.</span>
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={opt.isAvailable}
                      onChange={(e) =>
                        updateOption(idx, { isAvailable: e.target.checked })
                      }
                    />
                    <span>Доступен</span>
                  </label>
                </div>
                <div className="sm:col-span-1 text-right">
                  {options.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsDirty(true);
                        setOptions((prev) => prev.filter((_, i) => i !== idx));
                      }}
                      className="text-xs font-bold text-red-600 hover:underline"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-btn bg-brand text-white font-bold text-sm"
            >
              {saving ? 'Сохраняем...' : 'Сохранить группу'}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((grp) => (
            <div
              key={grp.id}
              className="bg-white rounded-panel p-5 shadow-card border border-blue-50 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">
                      {grp.name}
                    </h2>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {grp.isRequired ? 'Обязательная' : 'Необязательная'} ·{' '}
                      {grp.selectType === 'single'
                        ? 'Одиночный выбор'
                        : 'Множественный выбор'}
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-pill bg-brand-light text-brand-deep text-xs font-extrabold">
                    Товаров: {grp.attachedProducts.length}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {grp.options.map((opt) => (
                    <span
                      key={opt.id}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                        !opt.isAvailable
                          ? 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                          : opt.isDefault
                          ? 'bg-blue-50 border-brand text-brand-deep font-bold'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      {opt.name} (+{opt.priceDelta} ₽)
                      {opt.isDefault ? ' ★' : ''}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
                <button
                  type="button"
                  onClick={() => openEditGroup(grp)}
                  className="text-brand hover:underline"
                >
                  Редактировать
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteGroup(grp)}
                  className="text-red-600 hover:underline"
                >
                  Удалить группу
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
