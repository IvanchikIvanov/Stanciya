'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/core/ui/Logo';
import { NetworkBanner } from '@/core/ui/NetworkBanner';
import { ProductPlaceholder } from '@/core/ui/ProductPlaceholder';
import type { PointDto } from '@/core/points/service';
import type { PromoServiceBlock } from '@/core/types';
import type {
  CatalogCategoryDto,
  CatalogProductDto,
} from '@/modules/coffee/catalog/service';
import { ProductModal } from '@/modules/coffee/catalog/ProductModal';
import {
  getSelectedPointIdFromStorage,
  setSelectedPointIdInStorage,
  useCart,
} from '@/modules/coffee/catalog/cart-store';

export default function HomePage() {
  const cart = useCart();

  const [categories, setCategories] = useState<CatalogCategoryDto[]>([]);
  const [products, setProducts] = useState<CatalogProductDto[]>([]);
  const [points, setPoints] = useState<PointDto[]>([]);
  const [promoBlocks, setPromoBlocks] = useState<PromoServiceBlock[]>([]);
  const [user, setUser] = useState<{ id: number; name: string; role: string } | null>(
    null
  );

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);
  const [activeProduct, setActiveProduct] = useState<CatalogProductDto | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [catRes, meRes] = await Promise.all([
        fetch('/api/coffee/catalog', { cache: 'no-store' }),
        fetch('/api/core/auth/me', { cache: 'no-store' }),
      ]);

      if (!catRes.ok) {
        throw new Error('Failed to load catalog');
      }

      const catData = await catRes.json();
      setCategories(catData.categories ?? []);
      setProducts(catData.products ?? []);
      setPoints(catData.points ?? []);
      setPromoBlocks(catData.promoBlocks ?? []);

      if (meRes.ok) {
        const meData = await meRes.json();
        setUser(meData.user ?? null);
      }

      const storedPt = getSelectedPointIdFromStorage();
      if (storedPt && (catData.points ?? []).some((p: PointDto) => p.id === storedPt)) {
        setSelectedPointId(storedPt);
      } else if ((catData.points ?? []).length === 1) {
        setSelectedPointId(catData.points[0].id);
        setSelectedPointIdInStorage(catData.points[0].id);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleSelectPoint(id: number | null) {
    setSelectedPointId(id);
    setSelectedPointIdInStorage(id);
  }

  const allPointsClosed = useMemo(() => {
    if (points.length === 0) return false;
    return points.every((p) => !p.isOpenNow || !p.hasSlotsToday || !p.acceptsOrders);
  }, [points]);

  const nearestOpenLabel = useMemo(() => {
    const labels = points
      .map((p) => p.closedUntilLabel)
      .filter((l): l is string => Boolean(l));
    return labels[0] ?? null;
  }, [points]);

  const filteredProducts = useMemo(() => {
    if (selectedCategoryId === 'all') return products;
    return products.filter((p) => p.categoryId === selectedCategoryId);
  }, [products, selectedCategoryId]);

  const visiblePromoBlocks = useMemo(
    () => promoBlocks.filter((b) => Boolean(b.href && b.href.trim())),
    [promoBlocks]
  );

  return (
    <div className="min-h-screen flex flex-col pb-28">
      <NetworkBanner />

      {/* Шапка-баннер */}
      <header className="bg-brand text-white rounded-b-panel shadow-md">
        <div className="max-w-5xl mx-auto px-4 pt-4 pb-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <Logo variant="light" subtitle="г. Миасс" />
            <div className="flex items-center gap-2">
              {user ? (
                <Link
                  href={
                    user.role === 'admin'
                      ? '/admin'
                      : user.role === 'barista'
                      ? '/barista'
                      : '/profile'
                  }
                  className="px-4 py-2 rounded-btn bg-white/15 hover:bg-white/25 text-sm font-bold transition"
                >
                  {user.role === 'client' ? `Профиль (${user.name})` : user.name}
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-btn bg-white/15 hover:bg-white/25 text-sm font-bold transition"
                >
                  Войти
                </Link>
              )}
            </div>
          </div>

          <div className="bg-brand-dark/80 rounded-card p-5 border border-white/15">
            <h1 className="text-xl sm:text-2xl font-extrabold leading-snug">
              Кофе по пути. Закажи заранее. Забери без ожидания
            </h1>
            <p className="text-blue-100 text-xs sm:text-sm mt-1.5">
              Готовим к вашему приезду. Оплата при получении на точке «СТАНЦИЯ».
            </p>

            {/* Выбор точки самовывоза */}
            {points.length > 0 && (
              <div className="mt-4 pt-3 border-t border-white/15 flex flex-col sm:flex-row sm:items-center gap-2">
                <label
                  htmlFor="home-point-select"
                  className="text-xs font-bold uppercase tracking-wider text-blue-200 shrink-0"
                >
                  Точка самовывоза:
                </label>
                <select
                  id="home-point-select"
                  value={selectedPointId ?? ''}
                  onChange={(e) =>
                    handleSelectPoint(e.target.value ? Number(e.target.value) : null)
                  }
                  className="bg-white text-slate-900 rounded-btn px-3.5 py-2 text-sm font-semibold focus:outline-none"
                >
                  <option value="">Выберите при оформлении (все точки)</option>
                  {points.map((pt) => {
                    const statusSuffix =
                      !pt.acceptsOrders || !pt.isOpenNow || !pt.hasSlotsToday
                        ? ` (${pt.closedUntilLabel || 'Не принимает заказы'})`
                        : pt.asapSlot
                        ? ` (готово к ${pt.asapSlot.time})`
                        : '';
                    return (
                      <option key={pt.id} value={pt.id}>
                        {pt.name} — {pt.address}
                        {statusSuffix}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl w-full mx-auto px-4 mt-5 space-y-8 flex-1">
        {/* Плашка, если все точки закрыты */}
        {!loading && !loadError && allPointsClosed && (
          <div
            role="status"
            className="bg-amber-50 border border-amber-300 text-amber-900 rounded-card p-4 text-sm font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          >
            <span>
              Сейчас заказы не принимаем.
              {nearestOpenLabel ? ` ${nearestOpenLabel}.` : ''} Каталог доступен для просмотра.
            </span>
            <Link
              href="/info/points"
              className="text-brand font-bold underline text-xs shrink-0"
            >
              Часы работы точек
            </Link>
          </div>
        )}

        {/* Состояние загрузки */}
        {loading && (
          <section aria-label="Загрузка каталога" className="space-y-4">
            <div className="flex gap-2 overflow-hidden">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-10 w-24 rounded-pill bg-white animate-pulse"
                />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-card p-3 h-64 animate-pulse flex flex-col justify-between"
                >
                  <div className="bg-slate-200 rounded-2xl h-32 w-full" />
                  <div className="space-y-2">
                    <div className="h-4 bg-slate-200 rounded w-3/4" />
                    <div className="h-3 bg-slate-100 rounded w-full" />
                    <div className="h-8 bg-slate-200 rounded-btn w-full" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Ошибка загрузки */}
        {!loading && loadError && (
          <div
            role="alert"
            className="bg-white rounded-card p-8 shadow-card text-center space-y-4 border border-red-100"
          >
            <div className="text-lg font-extrabold text-slate-900">
              Не удалось загрузить каталог
            </div>
            <p className="text-sm text-slate-600">
              Проверьте подключение к интернету и попробуйте ещё раз.
            </p>
            <button
              type="button"
              onClick={loadData}
              className="px-6 py-3 rounded-btn bg-brand hover:bg-brand-dark text-white font-bold text-sm transition"
            >
              Повторить
            </button>
          </div>
        )}

        {/* Каталог */}
        {!loading && !loadError && (
          <section aria-label="Каталог напитков и еды" className="space-y-4">
            {/* Чипы категорий */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('all')}
                className={`px-4 py-2 rounded-pill text-sm font-bold shrink-0 transition ${
                  selectedCategoryId === 'all'
                    ? 'bg-brand text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-blue-50'
                }`}
              >
                Все
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`px-4 py-2 rounded-pill text-sm font-bold shrink-0 transition ${
                    selectedCategoryId === cat.id
                      ? 'bg-brand text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-blue-50'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Пустая категория */}
            {filteredProducts.length === 0 ? (
              <div className="bg-white rounded-card p-8 shadow-card text-center space-y-3">
                <div className="text-base font-extrabold text-slate-900">
                  В этой категории пока ничего нет
                </div>
                {selectedCategoryId !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryId('all')}
                    className="px-5 py-2.5 rounded-btn bg-brand text-white font-bold text-sm hover:bg-brand-dark transition"
                  >
                    Все товары
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {filteredProducts.map((prod) => {
                  const outOfStock = !prod.inStock;
                  return (
                    <article
                      key={prod.id}
                      onClick={() => {
                        if (!outOfStock) setActiveProduct(prod);
                      }}
                      className={`bg-white rounded-card shadow-card overflow-hidden flex flex-col justify-between border border-blue-50 transition ${
                        outOfStock
                          ? 'opacity-60'
                          : 'cursor-pointer hover:shadow-md hover:border-blue-200'
                      }`}
                    >
                      <div>
                        <div className="relative">
                          <ProductPlaceholder
                            name={prod.name}
                            imageUrl={prod.imageUrl}
                            className="w-full h-36 sm:h-40"
                          />
                          {outOfStock && (
                            <span className="absolute top-2 left-2 px-2.5 py-1 rounded-pill bg-slate-900/80 text-white text-[11px] font-bold">
                              Нет в наличии
                            </span>
                          )}
                        </div>
                        <div className="p-3 sm:p-3.5">
                          <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug">
                            {prod.name}
                          </h3>
                          {prod.description && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                              {prod.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="px-3 pb-3 sm:px-3.5 sm:pb-3.5 pt-1 flex items-center justify-between gap-2">
                        <span className="font-extrabold text-slate-900 text-sm sm:text-base">
                          {prod.modifierGroups.length > 0
                            ? `от ${prod.fromPrice} ₽`
                            : `${prod.fromPrice} ₽`}
                        </span>
                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!outOfStock) setActiveProduct(prod);
                          }}
                          aria-label={`Добавить ${prod.name}`}
                          className="w-10 h-10 rounded-btn bg-brand hover:bg-brand-dark disabled:bg-slate-300 text-white font-extrabold text-lg flex items-center justify-center transition shadow-xs"
                        >
                          +
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Промоблоки сервисов СТАНЦИЯ */}
        {visiblePromoBlocks.length > 0 && (
          <section aria-label="Другие сервисы СТАНЦИЯ" className="space-y-3 pt-2">
            <h2 className="text-lg font-extrabold text-slate-900">
              Экосистема «СТАНЦИЯ» в Миассе
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {visiblePromoBlocks.map((promo) => (
                <a
                  key={promo.id}
                  href={promo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white rounded-card p-4 shadow-card hover:shadow-md transition flex items-center gap-4 border border-blue-100 group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-brand-light text-brand flex items-center justify-center font-extrabold text-xl shrink-0 group-hover:bg-brand group-hover:text-white transition">
                    {promo.imageType === 'ev-charge'
                      ? '⚡'
                      : promo.imageType === 'taxi'
                      ? '🚕'
                      : promo.imageType === 'scooter'
                      ? '🛴'
                      : '🚗'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-slate-900 text-sm sm:text-base">
                      {promo.title}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                      {promo.description}
                    </div>
                  </div>
                  <span className="text-brand font-bold text-sm shrink-0">↗</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Футер с информационными страницами */}
        <footer className="pt-6 pb-4 border-t border-blue-100 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
          <div className="font-semibold text-slate-700">© «СТАНЦИЯ», г. Миасс</div>
          <nav className="flex flex-wrap gap-4" aria-label="Информация">
            <Link href="/info/points" className="hover:text-brand underline">
              Адреса и часы работы
            </Link>
            <Link href="/info/pickup" className="hover:text-brand underline">
              Условия самовывоза
            </Link>
            <Link href="/info/contacts" className="hover:text-brand underline">
              Контакты
            </Link>
            <Link href="/info/privacy" className="hover:text-brand underline">
              Политика конфиденциальности
            </Link>
            <Link href="/info/consent" className="hover:text-brand underline">
              Согласие на обработку ПДн
            </Link>
          </nav>
        </footer>
      </main>

      {/* Модальное окно карточки товара */}
      {activeProduct && (
        <ProductModal
          product={activeProduct}
          onClose={() => setActiveProduct(null)}
          onAdd={(item) => cart.addItem(item)}
        />
      )}

      {/* Плавающая панель корзины */}
      <div className="fixed bottom-4 inset-x-0 px-4 z-40 pointer-events-none">
        <div className="max-w-lg mx-auto pointer-events-auto">
          {cart.totalCount > 0 ? (
            <Link
              href="/cart"
              className="w-full min-h-[54px] px-5 py-3.5 rounded-panel bg-brand hover:bg-brand-dark text-white shadow-floating flex items-center justify-between font-extrabold text-sm sm:text-base transition"
            >
              <span className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-pill bg-white/20 text-xs font-extrabold">
                  {cart.totalCount}
                </span>
                <span>Корзина</span>
              </span>
              <span>{cart.totalSum} ₽ →</span>
            </Link>
          ) : (
            <div className="w-full min-h-[50px] px-5 py-3 rounded-panel bg-slate-800/90 text-slate-200 shadow-md flex items-center justify-between font-bold text-sm">
              <span>Корзина пуста</span>
              <span>0 ₽</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
