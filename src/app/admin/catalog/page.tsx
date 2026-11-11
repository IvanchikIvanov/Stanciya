'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ProductPlaceholder } from '@/core/ui/ProductPlaceholder';
import { useUnsavedChangesWarning } from '@/core/ui/useUnsavedChanges';
import type { CatalogCategoryDto } from '@/modules/coffee/catalog/service';
import type {
  AdminModifierGroupDto,
  AdminProductDto,
} from '@/modules/coffee/admin/service';

export default function AdminCatalogPage() {
  const [categories, setCategories] = useState<CatalogCategoryDto[]>([]);
  const [products, setProducts] = useState<AdminProductDto[]>([]);
  const [modifierGroups, setModifierGroups] = useState<AdminModifierGroupDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Форма категории
  const [editingCatId, setEditingCatId] = useState<number | 'new' | null>(null);
  const [catName, setCatName] = useState('');
  const [catOrder, setCatOrder] = useState(10);
  const [catPublished, setCatPublished] = useState(true);
  const [catDirty, setCatDirty] = useState(false);

  // Форма товара
  const [editingProdId, setEditingProdId] = useState<number | 'new' | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodCategoryId, setProdCategoryId] = useState<number>(0);
  const [prodDesc, setProdDesc] = useState('');
  const [prodImageUrl, setProdImageUrl] = useState<string | null>(null);
  const [prodBasePrice, setProdBasePrice] = useState<number>(190);
  const [prodPublished, setProdPublished] = useState(true);
  const [prodInStock, setProdInStock] = useState(true);
  const [prodGroupIds, setProdGroupIds] = useState<number[]>([]);
  const [prodDirty, setProdDirty] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  useUnsavedChangesWarning(catDirty || prodDirty);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/coffee/admin/catalog', { cache: 'no-store' });
      if (!res.ok) throw new Error('Load failed');
      const data = await res.json();
      setCategories(data.categories ?? []);
      setProducts(data.products ?? []);
      setModifierGroups(data.modifierGroups ?? []);
    } catch {
      setError('Не удалось загрузить каталог');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openNewCategory() {
    setEditingCatId('new');
    setCatName('');
    setCatOrder((categories.length + 1) * 10);
    setCatPublished(true);
    setCatDirty(false);
  }

  function openEditCategory(cat: CatalogCategoryDto) {
    setEditingCatId(cat.id);
    setCatName(cat.name);
    setCatOrder(cat.sortOrder);
    setCatPublished(cat.isPublished);
    setCatDirty(false);
  }

  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      const url =
        editingCatId === 'new'
          ? '/api/coffee/admin/categories'
          : `/api/coffee/admin/categories/${editingCatId}`;
      const method = editingCatId === 'new' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: catName.trim(),
          sortOrder: Number(catOrder),
          isPublished: catPublished,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: 'err',
          text: data?.error?.message || 'Ошибка при сохранении категории',
        });
        return;
      }
      setCatDirty(false);
      setEditingCatId(null);
      setFeedback({ type: 'ok', text: 'Категория сохранена' });
      await loadData();
    } catch {
      setFeedback({ type: 'err', text: 'Ошибка сети при сохранении категории' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCategory(cat: CatalogCategoryDto) {
    if (!window.confirm(`Удалить категорию «${cat.name}»?`)) return;
    setFeedback(null);
    try {
      const res = await fetch(`/api/coffee/admin/categories/${cat.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: 'err',
          text: data?.error?.message || 'Удалить категорию с товарами нельзя',
        });
        return;
      }
      setFeedback({ type: 'ok', text: 'Категория удалена' });
      await loadData();
    } catch {
      setFeedback({ type: 'err', text: 'Ошибка сети при удалении категории' });
    }
  }

  function openNewProduct() {
    setEditingProdId('new');
    setProdName('');
    setProdCategoryId(categories[0]?.id ?? 0);
    setProdDesc('');
    setProdImageUrl(null);
    setProdBasePrice(190);
    setProdPublished(true);
    setProdInStock(true);
    setProdGroupIds([]);
    setProdDirty(false);
  }

  function openEditProduct(prod: AdminProductDto) {
    setEditingProdId(prod.id);
    setProdName(prod.name);
    setProdCategoryId(prod.categoryId);
    setProdDesc(prod.description);
    setProdImageUrl(prod.imageUrl);
    setProdBasePrice(prod.basePrice);
    setProdPublished(prod.isPublished);
    setProdInStock(prod.inStock);
    setProdGroupIds(prod.modifierGroupIds);
    setProdDirty(false);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/coffee/admin/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: 'err',
          text:
            data?.error?.message ||
            'Не удалось загрузить фото (допустимы JPG, PNG, WebP до 5 МБ)',
        });
        // Прежнее фото остаётся
        return;
      }
      setProdImageUrl(data.imageUrl);
      setProdDirty(true);
      setFeedback({ type: 'ok', text: 'Фото загружено' });
    } catch {
      setFeedback({ type: 'err', text: 'Ошибка сети при загрузке фото' });
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      const url =
        editingProdId === 'new'
          ? '/api/coffee/admin/products'
          : `/api/coffee/admin/products/${editingProdId}`;
      const method = editingProdId === 'new' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: Number(prodCategoryId),
          name: prodName.trim(),
          description: prodDesc.trim(),
          imageUrl: prodImageUrl,
          basePrice: Number(prodBasePrice),
          isPublished: prodPublished,
          inStock: prodInStock,
          modifierGroupIds: prodGroupIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: 'err',
          text: data?.error?.message || 'Ошибка при сохранении товара',
        });
        return;
      }
      setProdDirty(false);
      setEditingProdId(null);
      setFeedback({ type: 'ok', text: 'Товар сохранён' });
      await loadData();
    } catch {
      setFeedback({ type: 'err', text: 'Ошибка сети при сохранении товара' });
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickToggleProduct(
    prod: AdminProductDto,
    field: 'inStock' | 'isPublished'
  ) {
    setFeedback(null);
    try {
      const res = await fetch(`/api/coffee/admin/products/${prod.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: prod.categoryId,
          name: prod.name,
          description: prod.description,
          imageUrl: prod.imageUrl,
          basePrice: prod.basePrice,
          isPublished: field === 'isPublished' ? !prod.isPublished : prod.isPublished,
          inStock: field === 'inStock' ? !prod.inStock : prod.inStock,
          modifierGroupIds: prod.modifierGroupIds,
        }),
      });
      if (res.ok) {
        await loadData();
      }
    } catch {
      setFeedback({ type: 'err', text: 'Не удалось обновить статус товара' });
    }
  }

  async function handleDeleteProduct(prod: AdminProductDto) {
    if (!window.confirm(`Удалить товар «${prod.name}»?`)) return;
    setFeedback(null);
    try {
      const res = await fetch(`/api/coffee/admin/products/${prod.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setFeedback({ type: 'ok', text: 'Товар удалён' });
        await loadData();
      }
    } catch {
      setFeedback({ type: 'err', text: 'Не удалось удалить товар' });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Управление каталогом
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Категории, позиции меню, наличие и фотографии
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={openNewCategory}
            className="px-4 py-2.5 rounded-btn bg-white border border-brand text-brand font-bold text-sm hover:bg-blue-50 transition"
          >
            + Категория
          </button>
          {categories.length > 0 && (
            <button
              type="button"
              onClick={openNewProduct}
              className="px-4 py-2.5 rounded-btn bg-brand hover:bg-brand-dark text-white font-bold text-sm transition shadow-xs"
            >
              + Товар
            </button>
          )}
        </div>
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

      {loading ? (
        <div className="h-64 bg-white rounded-panel animate-pulse" />
      ) : error ? (
        <div className="bg-white rounded-panel p-8 text-center space-y-3">
          <div className="font-extrabold text-slate-900">{error}</div>
          <button
            type="button"
            onClick={loadData}
            className="px-5 py-2.5 rounded-btn bg-brand text-white font-bold text-sm"
          >
            Повторить
          </button>
        </div>
      ) : categories.length === 0 && editingCatId === null ? (
        <div className="bg-white rounded-panel p-10 text-center shadow-card space-y-4">
          <div className="text-lg font-extrabold text-slate-900">
            Создайте первую категорию
          </div>
          <button
            type="button"
            onClick={openNewCategory}
            className="px-5 py-2.5 rounded-btn bg-brand text-white font-bold text-sm"
          >
            Создать категорию
          </button>
        </div>
      ) : (
        <>
          {/* Форма категории */}
          {editingCatId !== null && (
            <form
              onSubmit={handleSaveCategory}
              className="bg-white rounded-panel p-6 shadow-card border-2 border-brand space-y-4"
            >
              <h2 className="text-lg font-extrabold text-slate-900">
                {editingCatId === 'new'
                  ? 'Новая категория'
                  : 'Редактирование категории'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Название категории *
                  </label>
                  <input
                    type="text"
                    required
                    value={catName}
                    onChange={(e) => {
                      setCatName(e.target.value);
                      setCatDirty(true);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Порядок сортировки
                  </label>
                  <input
                    type="number"
                    required
                    value={catOrder}
                    onChange={(e) => {
                      setCatOrder(Number(e.target.value));
                      setCatDirty(true);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={catPublished}
                      onChange={(e) => {
                        setCatPublished(e.target.checked);
                        setCatDirty(true);
                      }}
                      className="w-4 h-4"
                    />
                    <span>Опубликована на витрине</span>
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-btn bg-brand text-white font-bold text-sm"
                >
                  Сохранить категорию
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (catDirty && !window.confirm('Отменить несохранённые изменения?')) {
                      return;
                    }
                    setCatDirty(false);
                    setEditingCatId(null);
                  }}
                  className="px-4 py-2.5 rounded-btn bg-slate-100 text-slate-700 font-bold text-sm"
                >
                  Отмена
                </button>
              </div>
            </form>
          )}

          {/* Форма товара */}
          {editingProdId !== null && (
            <form
              onSubmit={handleSaveProduct}
              className="bg-white rounded-panel p-6 shadow-card border-2 border-brand space-y-4"
            >
              <h2 className="text-lg font-extrabold text-slate-900">
                {editingProdId === 'new' ? 'Новый товар' : 'Редактирование товара'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Название товара *
                  </label>
                  <input
                    type="text"
                    required
                    value={prodName}
                    onChange={(e) => {
                      setProdName(e.target.value);
                      setProdDirty(true);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Категория *
                  </label>
                  <select
                    required
                    value={prodCategoryId}
                    onChange={(e) => {
                      setProdCategoryId(Number(e.target.value));
                      setProdDirty(true);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Базовая цена (₽) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={prodBasePrice}
                    onChange={(e) => {
                      setProdBasePrice(Number(e.target.value));
                      setProdDirty(true);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-btn border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Описание
                </label>
                <textarea
                  rows={2}
                  value={prodDesc}
                  onChange={(e) => {
                    setProdDesc(e.target.value);
                    setProdDirty(true);
                  }}
                  className="w-full px-3.5 py-2 rounded-btn border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-700">
                    Фотография (JPG, PNG, WebP до 5 МБ)
                  </div>
                  <div className="flex items-center gap-3">
                    <ProductPlaceholder
                      name={prodName || 'Товар'}
                      imageUrl={prodImageUrl}
                      className="w-20 h-20 rounded-xl shrink-0"
                    />
                    <div className="space-y-1.5">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePhotoUpload}
                        disabled={uploadingPhoto}
                        className="text-xs text-slate-600"
                      />
                      {prodImageUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setProdImageUrl(null);
                            setProdDirty(true);
                          }}
                          className="block text-xs text-red-600 font-bold underline"
                        >
                          Удалить фото (использовать заглушку)
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-700">
                    Группы модификаторов
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {modifierGroups.map((g) => {
                      const checked = prodGroupIds.includes(g.id);
                      return (
                        <label
                          key={g.id}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                            checked
                              ? 'bg-brand-light border-brand text-brand-deep'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setProdDirty(true);
                              if (e.target.checked) {
                                setProdGroupIds((prev) => [...prev, g.id]);
                              } else {
                                setProdGroupIds((prev) =>
                                  prev.filter((id) => id !== g.id)
                                );
                              }
                            }}
                            className="mr-1.5"
                          />
                          {g.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={prodPublished}
                    onChange={(e) => {
                      setProdPublished(e.target.checked);
                      setProdDirty(true);
                    }}
                    className="w-4 h-4"
                  />
                  <span>Опубликован</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={prodInStock}
                    onChange={(e) => {
                      setProdInStock(e.target.checked);
                      setProdDirty(true);
                    }}
                    className="w-4 h-4"
                  />
                  <span>В наличии</span>
                </label>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving || uploadingPhoto}
                  className="px-5 py-2.5 rounded-btn bg-brand text-white font-bold text-sm"
                >
                  {saving ? 'Сохраняем...' : 'Сохранить товар'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (prodDirty && !window.confirm('Отменить несохранённые изменения?')) {
                      return;
                    }
                    setProdDirty(false);
                    setEditingProdId(null);
                  }}
                  className="px-4 py-2.5 rounded-btn bg-slate-100 text-slate-700 font-bold text-sm"
                >
                  Отмена
                </button>
              </div>
            </form>
          )}

          {/* Список категорий */}
          <section className="bg-white rounded-panel p-5 shadow-card border border-blue-50 space-y-3">
            <h2 className="text-base font-extrabold text-slate-900">Категории</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="p-3.5 rounded-card border border-slate-200 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-extrabold text-slate-900 text-sm">
                      {cat.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      Порядок: {cat.sortOrder} ·{' '}
                      {cat.isPublished ? (
                        <span className="text-emerald-700 font-semibold">Видна</span>
                      ) : (
                        <span className="text-red-600 font-semibold">Скрыта</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => openEditCategory(cat)}
                      className="text-brand hover:underline"
                    >
                      Изм.
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat)}
                      className="text-red-600 hover:underline"
                    >
                      Удал.
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Список товаров */}
          <section className="bg-white rounded-panel p-5 shadow-card border border-blue-50 space-y-4">
            <h2 className="text-base font-extrabold text-slate-900">
              Позиции меню ({products.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2.5 pr-3">Товар</th>
                    <th className="py-2.5 px-3">Категория</th>
                    <th className="py-2.5 px-3">Базовая цена</th>
                    <th className="py-2.5 px-3">В наличии</th>
                    <th className="py-2.5 px-3">Опубликован</th>
                    <th className="py-2.5 pl-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((prod) => (
                    <tr key={prod.id} className="hover:bg-slate-50/80">
                      <td className="py-3 pr-3">
                        <div className="font-extrabold text-slate-900">
                          {prod.name}
                        </div>
                        <div className="text-xs text-slate-500 line-clamp-1">
                          {prod.description}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-700 font-medium">
                        {prod.categoryName}
                      </td>
                      <td className="py-3 px-3 font-extrabold text-slate-900">
                        {prod.basePrice} ₽
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => handleQuickToggleProduct(prod, 'inStock')}
                          className={`px-2.5 py-1 rounded-pill text-xs font-extrabold ${
                            prod.inStock
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {prod.inStock ? 'В наличии' : 'Нет в наличии'}
                        </button>
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => handleQuickToggleProduct(prod, 'isPublished')}
                          className={`px-2.5 py-1 rounded-pill text-xs font-extrabold ${
                            prod.isPublished
                              ? 'bg-blue-100 text-brand-deep'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {prod.isPublished ? 'Да' : 'Скрыт'}
                        </button>
                      </td>
                      <td className="py-3 pl-3 text-right space-x-3 font-bold text-xs">
                        <button
                          type="button"
                          onClick={() => openEditProduct(prod)}
                          className="text-brand hover:underline"
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(prod)}
                          className="text-red-600 hover:underline"
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
