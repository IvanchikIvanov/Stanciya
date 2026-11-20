'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  getPickupChoiceFromStorage,
  getSelectedPointIdFromStorage,
  setPickupChoiceInStorage,
  setSelectedPointIdInStorage,
  useCart,
} from '@/modules/coffee/catalog/cart-store';

type SessionInfo = { id: number; name: string; role: string } | null;

function pointIsAvailable(p: PointDto): boolean {
  return p.acceptsOrders && p.isOpenNow && p.hasSlotsToday;
}

export default function HomePage() {
  const cart = useCart();
  const router = useRouter();

  const [categories, setCategories] = useState<CatalogCategoryDto[]>([]);
  const [products, setProducts] = useState<CatalogProductDto[]>([]);
  const [points, setPoints] = useState<PointDto[]>([]);
  const [promoBlocks, setPromoBlocks] = useState<PromoServiceBlock[]>([]);
  // pointId → товары, снятые бариста с наличия на этой точке
  const [stopLists, setStopLists] = useState<Record<number, number[]>>({});
  const [user, setUser] = useState<SessionInfo>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);
  // '' — «как можно скорее», иначе слот ЧЧ:ММ
  const [pickupTime, setPickupTime] = useState<string>('');
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
      if (!catRes.ok) throw new Error('Failed to load catalog');

      const catData = await catRes.json();
      const loadedPoints: PointDto[] = catData.points ?? [];
      setCategories(catData.categories ?? []);
      setProducts(catData.products ?? []);
      setPoints(loadedPoints);
      setPromoBlocks(catData.promoBlocks ?? []);
      setStopLists(catData.stopLists ?? {});

      if (meRes.ok) {
        const meData = await meRes.json();
        setUser(meData.user ?? null);
      }

      const storedPt = getSelectedPointIdFromStorage();
      if (storedPt && loadedPoints.some((p) => p.id === storedPt)) {
        setSelectedPointId(storedPt);
      } else if (loadedPoints.length === 1) {
        setSelectedPointId(loadedPoints[0].id);
        setSelectedPointIdInStorage(loadedPoints[0].id);
      }

      const storedPickup = getPickupChoiceFromStorage();
      if (storedPickup && !storedPickup.isAsap && storedPickup.time) {
        setPickupTime(storedPickup.time);
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
    setPickupTime('');
  }

  const selectedPoint = useMemo(
    () => points.find((p) => p.id === selectedPointId) ?? null,
    [points, selectedPointId]
  );

  // Выбранный слот мог устареть — тогда возвращаемся к «как можно скорее»
  useEffect(() => {
    if (pickupTime && selectedPoint && !selectedPoint.slots.some((s) => s.time === pickupTime)) {
      setPickupTime('');
    }
  }, [pickupTime, selectedPoint]);

  const stoppedHere = useMemo(
    () => new Set<number>(selectedPointId ? stopLists[selectedPointId] ?? [] : []),
    [stopLists, selectedPointId]
  );

  const allPointsClosed = useMemo(
    () => points.length > 0 && points.every((p) => !pointIsAvailable(p)),
    [points]
  );

  const nearestOpenLabel = useMemo(
    () => points.map((p) => p.closedUntilLabel).find((l): l is string => Boolean(l)) ?? null,
    [points]
  );

  const filteredProducts = useMemo(
    () =>
      selectedCategoryId === 'all'
        ? products
        : products.filter((p) => p.categoryId === selectedCategoryId),
    [products, selectedCategoryId]
  );

  const visiblePromoBlocks = useMemo(
    () => promoBlocks.filter((b) => Boolean(b.href && b.href.trim())),
    [promoBlocks]
  );

  function goToCheckout() {
    setPickupChoiceInStorage({ isAsap: pickupTime === '', time: pickupTime || null });
    router.push('/checkout');
  }

  const accountHref = user
    ? user.role === 'admin'
      ? '/admin'
      : user.role === 'barista'
      ? '/barista'
      : '/profile'
    : '/login';

  return (
    <div className="min-h-screen flex flex-col bg-brand-surface pb-24 lg:pb-0">
      <NetworkBanner />

      {/* ───────── Шапка ───────── */}
      <header className="sticky top-0 z-30 bg-brand-surface/90 backdrop-blur border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-[72px] flex items-center gap-6">
          <Logo variant="dark" size="lg" />

          <nav aria-label="Разделы" className="hidden lg:flex items-center gap-7 ml-6 text-[15px] font-semibold text-slate-900">
            <a href="#menu" className="hover:text-brand transition">Кофе</a>
            <a href="#how" className="hover:text-brand transition">Как это работает</a>
            <Link href="/info/points" className="hover:text-brand transition">Наши точки</Link>
            {visiblePromoBlocks.length > 0 && (
              <a href="#services" className="hover:text-brand transition">Другие сервисы</a>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            {points.length > 0 && (
              <label className="hidden md:flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <PinIcon className="w-4 h-4 text-slate-700" />
                <span className="sr-only">Точка самовывоза</span>
                <select
                  value={selectedPointId ?? ''}
                  onChange={(e) => handleSelectPoint(e.target.value ? Number(e.target.value) : null)}
                  className="bg-transparent font-semibold max-w-[13rem] truncate focus:outline-none cursor-pointer"
                >
                  <option value="">Выберите точку</option>
                  {points.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <Link
              href={accountHref}
              aria-label={user ? `Профиль: ${user.name}` : 'Войти'}
              title={user ? user.name : 'Войти'}
              className="w-11 h-11 rounded-full flex items-center justify-center text-slate-900 hover:bg-white transition"
            >
              {user ? (
                // Вошедший: круглый значок с первой буквой имени и зелёной точкой
                <span className="relative w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center text-sm font-extrabold uppercase">
                  {(user.name.trim()[0] || '•').toUpperCase()}
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-brand-surface"
                  />
                </span>
              ) : (
                <UserIcon className="w-6 h-6" />
              )}
            </Link>

            <Link
              href="/cart"
              aria-label={`Корзина: ${cart.totalCount} шт.`}
              className="relative w-11 h-11 rounded-full flex items-center justify-center text-slate-900 hover:bg-white transition"
            >
              <CartIcon className="w-6 h-6" />
              <span className="absolute top-0.5 right-0.5 min-w-[20px] h-5 px-1 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center">
                {cart.totalCount}
              </span>
            </Link>
          </div>
        </div>
      </header>

      {/* ───────── Первый экран ───────── */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-stretch">
          <div className="px-4 sm:px-6 pt-10 pb-10 lg:py-16 relative z-10">
            <div className="flex items-center gap-2 text-brand text-xs sm:text-sm font-extrabold tracking-[0.12em] uppercase">
              <BoltIcon className="w-4 h-4" />
              Кофе по предзаказу
            </div>

            <h1 className="display-tight text-[44px] sm:text-[64px] xl:text-[76px] text-brand-ink mt-5">
              Кофе.Пауза.
              <br />
              И&nbsp;снова
              <br />
              <span className="inline-block bg-brand text-white px-3 pb-1 mt-1 -rotate-1">
                в&nbsp;путь.
              </span>
            </h1>

            <p className="mt-7 text-base sm:text-lg text-slate-800 max-w-md leading-relaxed">
              Закажи заранее — выбери напиток, <b>точку</b> и <b>время получения</b>. Забери
              любимый кофе без ожидания.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-6">
              <a
                href="#menu"
                className="inline-flex items-center gap-2 min-h-[52px] px-6 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold transition shadow-floating"
              >
                Собрать предзаказ <ArrowIcon className="w-4 h-4" />
              </a>
              <a
                href="#how"
                className="font-bold text-slate-900 underline underline-offset-[6px] decoration-2 hover:text-brand"
              >
                Как это работает
              </a>
            </div>

            <p className="mt-6 flex items-center gap-2 text-xs sm:text-sm text-slate-600">
              <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" aria-hidden="true" />
              Бариста приготовит к выбранному времени и подтвердит готовность
            </p>
          </div>

          {/* На десктопе фото уходит до правого края экрана, без пустой полосы справа */}
          <div className="relative min-h-[260px] sm:min-h-[340px] lg:min-h-0 lg:absolute lg:inset-y-0 lg:right-0 lg:left-[max(46.5%,calc(50%-45px))]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/hero.jpg"
              alt="Фирменный стакан «СТАНЦИЯ» на стойке кофейни"
              className="absolute inset-0 w-full h-full object-cover object-left lg:object-center"
            />
            <div
              aria-hidden="true"
              className="hidden lg:block absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-brand-surface to-transparent"
            />
          </div>
        </div>
      </section>

      {/* ───────── Как это работает ───────── */}
      <section id="how" aria-label="Как это работает" className="bg-brand text-white scroll-mt-20">
        <ol className="max-w-7xl mx-auto px-4 sm:px-6 py-7 grid sm:grid-cols-3 gap-6 sm:gap-0">
          {[
            { icon: <CupIcon className="w-9 h-9" />, title: '1. Выбери напиток', text: 'Объём, молоко и сироп — под себя' },
            { icon: <PinIcon className="w-9 h-9" />, title: '2. Укажи точку и время', text: 'Выбери удобное место самовывоза' },
            { icon: <CheckCircleIcon className="w-9 h-9" />, title: '3. Забери без очереди', text: 'Оплати при получении' },
          ].map((step, i) => (
            <li
              key={step.title}
              className={`flex items-center gap-4 sm:justify-center ${
                i > 0 ? 'sm:border-l sm:border-white/35' : ''
              }`}
            >
              <span className="shrink-0">{step.icon}</span>
              <span>
                <span className="block text-lg font-extrabold leading-tight">{step.title}</span>
                <span className="block text-xs sm:text-sm text-white/85 mt-1">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ───────── Меню и предзаказ ───────── */}
      <main id="menu" className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-12 lg:pt-14 pb-12 scroll-mt-16 flex-1">
        {!loading && !loadError && allPointsClosed && (
          <div
            role="status"
            className="mb-8 bg-amber-50 border border-amber-300 text-amber-950 rounded-2xl p-4 text-sm font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          >
            <span>
              Сейчас заказы не принимаем.
              {nearestOpenLabel ? ` ${nearestOpenLabel}.` : ''} Каталог доступен для просмотра.
            </span>
            <Link href="/info/points" className="text-brand font-bold underline text-xs shrink-0">
              Часы работы точек
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-8 xl:gap-10 items-start">
          <section aria-label="Меню" className="min-w-0">
            <h2 className="display-tight text-[34px] sm:text-[42px] text-brand-ink max-w-sm">
              Что сегодня зарядит?
            </h2>
            <p className="mt-3 text-slate-600">
              Выбирай любимый вкус и настраивай напиток под себя.
            </p>

            {loading && <CatalogSkeleton />}

            {!loading && loadError && (
              <div role="alert" className="mt-8 bg-white rounded-2xl p-8 shadow-card text-center space-y-4 border border-red-100">
                <div className="text-lg font-extrabold">Не удалось загрузить каталог</div>
                <p className="text-sm text-slate-600">Проверьте подключение к интернету и попробуйте ещё раз.</p>
                <button
                  type="button"
                  onClick={loadData}
                  className="px-6 py-3 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-sm transition"
                >
                  Повторить
                </button>
              </div>
            )}

            {!loading && !loadError && (
              <>
                <div className="mt-7 flex items-center gap-2.5 overflow-x-auto pb-1 no-scrollbar" role="tablist" aria-label="Категории">
                  <CategoryChip active={selectedCategoryId === 'all'} onClick={() => setSelectedCategoryId('all')}>
                    Все напитки
                  </CategoryChip>
                  {categories.map((cat) => (
                    <CategoryChip
                      key={cat.id}
                      active={selectedCategoryId === cat.id}
                      onClick={() => setSelectedCategoryId(cat.id)}
                    >
                      {cat.name}
                    </CategoryChip>
                  ))}
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="mt-6 bg-white rounded-2xl p-8 shadow-card text-center space-y-3">
                    <div className="font-extrabold">В этой категории пока ничего нет</div>
                    {selectedCategoryId !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setSelectedCategoryId('all')}
                        className="px-5 py-2.5 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-dark transition"
                      >
                        Все товары
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                    {filteredProducts.map((prod) => (
                      <ProductCard
                        key={prod.id}
                        product={prod}
                        stoppedAtPoint={stoppedHere.has(prod.id)}
                        onOpen={() => setActiveProduct(prod)}
                      />
                    ))}
                  </div>
                )}

                <p className="mt-5 flex items-center gap-2 text-xs sm:text-sm text-slate-600">
                  <SlidersIcon className="w-4 h-4 text-brand shrink-0" />
                  У каждого напитка можно выбрать объём, молоко и сироп
                </p>
              </>
            )}
          </section>

          {/* Панель «Твой предзаказ» (на телефоне — плавающая кнопка корзины внизу) */}
          <aside aria-label="Твой предзаказ" className="hidden lg:block sticky top-24">
            <OrderPanel
              cart={cart}
              points={points}
              selectedPoint={selectedPoint}
              selectedPointId={selectedPointId}
              onSelectPoint={handleSelectPoint}
              pickupTime={pickupTime}
              onPickupTime={setPickupTime}
              onCheckout={goToCheckout}
              stoppedHere={stoppedHere}
            />
          </aside>
        </div>

        {/* ───────── Другие сервисы ───────── */}
        {visiblePromoBlocks.length > 0 && (
          <section id="services" aria-label="Другие сервисы СТАНЦИИ" className="mt-16 pt-12 border-t border-slate-200 scroll-mt-20">
            <h2 className="display-tight text-[28px] sm:text-[34px] text-brand-ink">Другие сервисы СТАНЦИИ</h2>
            <p className="mt-2 text-slate-600">Больше возможностей для движения — в одной экосистеме.</p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {visiblePromoBlocks.map((promo) => (
                <a
                  key={promo.id}
                  href={promo.href}
                  target={promo.isExternal ? '_blank' : undefined}
                  rel={promo.isExternal ? 'noopener noreferrer' : undefined}
                  className="group bg-white rounded-2xl p-5 border border-slate-200/80 hover:border-brand/40 hover:shadow-card transition flex items-center gap-4"
                >
                  <span className="text-brand shrink-0">
                    <ServiceIcon type={promo.imageType} className="w-8 h-8" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-900 group-hover:text-brand transition">{promo.title}</span>
                    <span className="block text-xs text-slate-500 mt-0.5 line-clamp-2">{promo.description}</span>
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ───────── Финальный баннер ───────── */}
        <section className="mt-16 relative overflow-hidden rounded-3xl bg-brand-ink text-white px-6 sm:px-10 py-10 sm:py-12">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-[58%] w-40 bg-brand -skew-x-[28deg] hidden md:block"
          />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="display-tight text-[28px] sm:text-[36px]">СТАНЦИЯ — твоя энергия в движении</h2>
              <p className="mt-3 text-sm text-white/80">Кофе по пути. Городские сервисы. Больше времени на главное.</p>
            </div>
            <a
              href="#menu"
              className="self-start md:self-auto inline-flex items-center gap-2 min-h-[48px] px-5 rounded-xl bg-brand hover:bg-white hover:text-brand font-bold transition shrink-0"
            >
              Выбрать кофе <ArrowIcon className="w-4 h-4" />
            </a>
          </div>
        </section>
      </main>

      {/* ───────── Подвал ───────── */}
      <footer className="border-t border-slate-200 bg-brand-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col md:flex-row md:items-center justify-between gap-5 text-sm text-slate-600">
          <div className="flex items-center gap-4">
            <Logo variant="dark" size="sm" />
            <span>г. Миасс</span>
          </div>
          <nav aria-label="Информация" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/info/points" className="hover:text-brand">Адреса и часы работы</Link>
            <Link href="/info/pickup" className="hover:text-brand">Условия самовывоза</Link>
            <Link href="/info/contacts" className="hover:text-brand">Контакты</Link>
            <Link href="/info/privacy" className="hover:text-brand">Политика конфиденциальности</Link>
            <Link href="/info/consent" className="hover:text-brand">Согласие на обработку данных</Link>
          </nav>
        </div>
      </footer>

      {activeProduct && (
        <ProductModal
          product={activeProduct}
          onClose={() => setActiveProduct(null)}
          onAdd={(item) => cart.addItem(item)}
        />
      )}

      {/* Плавающая корзина для телефона и планшета */}
      <div className="lg:hidden fixed bottom-4 inset-x-0 px-4 z-40 pointer-events-none">
        <div className="max-w-lg mx-auto pointer-events-auto">
          {cart.totalCount > 0 ? (
            <Link
              href="/cart"
              className="w-full min-h-[56px] px-5 rounded-2xl bg-brand hover:bg-brand-dark text-white shadow-floating flex items-center justify-between font-extrabold transition"
            >
              <span className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-white/20 text-xs">
                  {cart.totalCount}
                </span>
                Твой предзаказ
              </span>
              <span>{cart.totalSum} ₽ →</span>
            </Link>
          ) : (
            <div className="w-full min-h-[52px] px-5 rounded-2xl bg-brand-ink/90 text-white/80 shadow-md flex items-center justify-between font-bold text-sm">
              <span>Корзина пуста</span>
              <span>0 ₽</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Компоненты ───────────────────────── */

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-[42px] px-5 rounded-full text-sm font-bold shrink-0 border transition ${
        active
          ? 'bg-brand border-brand text-white'
          : 'bg-white border-slate-200 text-slate-800 hover:border-brand/50'
      }`}
    >
      {children}
    </button>
  );
}

function ProductCard({
  product,
  stoppedAtPoint,
  onOpen,
}: {
  product: CatalogProductDto;
  stoppedAtPoint: boolean;
  onOpen: () => void;
}) {
  const outOfStock = !product.inStock || stoppedAtPoint;
  const hasOptions = product.modifierGroups.length > 0;
  return (
    <article
      className={`bg-white rounded-2xl border border-slate-200/80 overflow-hidden flex flex-col transition ${
        outOfStock ? 'opacity-60' : 'hover:shadow-card hover:border-slate-300'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={outOfStock}
        className="relative block text-left disabled:cursor-not-allowed"
        aria-label={`${product.name}: подробнее`}
      >
        <ProductPlaceholder name={product.name} imageUrl={product.imageUrl} className="w-full h-36 sm:h-44" />
        {outOfStock && (
          <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-brand-ink/85 text-white text-[11px] font-bold">
            {product.inStock ? 'Нет на этой точке' : 'Нет в наличии'}
          </span>
        )}
      </button>
      <div className="p-3.5 sm:p-4 flex flex-col flex-1">
        <h3 className="font-bold text-slate-900 text-base sm:text-lg leading-snug">{product.name}</h3>
        {product.description && (
          <p className="text-xs sm:text-sm text-slate-500 mt-1 line-clamp-2">{product.description}</p>
        )}
        <div className="mt-auto pt-4 flex flex-col items-stretch gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <span className="font-extrabold text-slate-900 text-base sm:text-lg whitespace-nowrap">
            {hasOptions ? `от ${product.fromPrice} ₽` : `${product.fromPrice} ₽`}
          </span>
          <button
            type="button"
            onClick={onOpen}
            disabled={outOfStock}
            aria-label={`${hasOptions ? 'Выбрать' : 'Добавить'} ${product.name}`}
            className="min-h-[40px] px-3 sm:px-4 shrink-0 rounded-xl border-[1.5px] border-brand text-brand text-xs sm:text-sm font-bold hover:bg-brand hover:text-white disabled:border-slate-300 disabled:text-slate-400 disabled:hover:bg-transparent transition"
          >
            {hasOptions ? 'Выбрать' : 'Добавить'}
          </button>
        </div>
      </div>
    </article>
  );
}

function OrderPanel({
  cart,
  points,
  selectedPoint,
  selectedPointId,
  onSelectPoint,
  pickupTime,
  onPickupTime,
  onCheckout,
  stoppedHere,
}: {
  stoppedHere: Set<number>;
  cart: ReturnType<typeof useCart>;
  points: PointDto[];
  selectedPoint: PointDto | null;
  selectedPointId: number | null;
  onSelectPoint: (id: number | null) => void;
  pickupTime: string;
  onPickupTime: (t: string) => void;
  onCheckout: () => void;
}) {
  const hasItems = cart.hydrated && cart.items.length > 0;
  const pointReady = selectedPoint !== null && pointIsAvailable(selectedPoint);
  const hasStopped = cart.items.some((i) => stoppedHere.has(i.productId));
  const step = !hasItems ? 1 : !pointReady || hasStopped ? 2 : 3;

  let ctaLabel = 'Оформить предзаказ';
  if (!hasItems) ctaLabel = 'Сначала выбери напиток';
  else if (!selectedPoint) ctaLabel = 'Выбери точку получения';
  else if (!pointReady) ctaLabel = 'Точка сейчас не принимает заказы';
  else if (hasStopped) ctaLabel = 'Убери позиции, которых нет на точке';

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold tracking-tight text-brand-ink">Твой предзаказ</h2>
        <span className="px-2.5 py-1 rounded-full bg-brand-light text-brand text-[11px] font-extrabold uppercase whitespace-nowrap">
          Шаг {step} из 3
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Собери заказ, укажи точку и время. Мы передадим его бариста.
      </p>

      {/* Состав */}
      {!hasItems ? (
        <div className="mt-5 rounded-2xl border-[1.5px] border-dashed border-slate-300 bg-brand-surface/60 px-4 py-6 text-center">
          <span className="mx-auto w-9 h-9 rounded-full bg-brand-light text-brand flex items-center justify-center text-xl font-bold" aria-hidden="true">
            +
          </span>
          <div className="mt-3 text-sm font-bold text-slate-900">Здесь появится твой кофе</div>
          <div className="mt-1 text-xs text-slate-500">Выбери напиток в меню и настрой его под себя</div>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-slate-100 border-y border-slate-100 max-h-[280px] overflow-y-auto">
          {cart.items.map((item) => (
            <li key={item.key} className="py-3 flex gap-3">
              <ProductPlaceholder
                name={item.productName}
                imageUrl={item.imageUrl}
                className="w-12 h-12 rounded-xl shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900 leading-snug">{item.productName}</span>
                  <button
                    type="button"
                    onClick={() => cart.removeItem(item.key)}
                    aria-label={`Удалить ${item.productName}`}
                    className="w-6 h-6 -mt-0.5 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center shrink-0"
                  >
                    ×
                  </button>
                </div>
                {stoppedHere.has(item.productId) && (
                  <div className="text-[11px] font-bold text-red-600 mt-0.5">Нет на выбранной точке</div>
                )}
                {item.modifiers.length > 0 && (
                  <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                    {item.modifiers.map((m) => m.optionName).join(' · ')}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <div className="inline-flex items-center rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => cart.setQuantity(item.key, item.quantity - 1)}
                      aria-label="Меньше"
                      className="w-8 h-8 text-slate-700 hover:text-brand font-bold"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => cart.setQuantity(item.key, item.quantity + 1)}
                      disabled={item.quantity >= 20}
                      aria-label="Больше"
                      className="w-8 h-8 text-slate-700 hover:text-brand font-bold disabled:text-slate-300"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-sm font-extrabold">{item.unitPrice * item.quantity} ₽</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasItems && (
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-sm font-bold text-slate-600">Итого</span>
          <span className="text-2xl font-extrabold text-brand-ink">{cart.totalSum} ₽</span>
        </div>
      )}

      {/* Точка и время */}
      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="block text-xs font-bold text-slate-900 mb-1.5">Точка получения</span>
          <select
            value={selectedPointId ?? ''}
            onChange={(e) => onSelectPoint(e.target.value ? Number(e.target.value) : null)}
            className="w-full h-12 px-3.5 rounded-xl border border-slate-300 bg-white text-sm focus:border-brand focus:outline-none"
          >
            <option value="">Выберите точку</option>
            {points.map((pt) => (
              <option key={pt.id} value={pt.id} disabled={!pointIsAvailable(pt)}>
                {pt.name}
                {!pointIsAvailable(pt) ? ` — ${pt.closedUntilLabel || 'не принимает заказы'}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-bold text-slate-900 mb-1.5">Когда забрать</span>
          <select
            value={pickupTime}
            onChange={(e) => onPickupTime(e.target.value)}
            disabled={!pointReady}
            className="w-full h-12 px-3.5 rounded-xl border border-slate-300 bg-white text-sm focus:border-brand focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
          >
            {!selectedPoint && <option value="">Сначала выберите точку</option>}
            {selectedPoint && !pointReady && (
              <option value="">{selectedPoint.closedUntilLabel || 'Сегодня заказы не принимаются'}</option>
            )}
            {pointReady && (
              <>
                <option value="">
                  Как можно скорее{selectedPoint?.asapSlot ? ` (к ${selectedPoint.asapSlot.time})` : ''}
                </option>
                {selectedPoint!.slots.map((s) => (
                  <option key={s.time} value={s.time}>
                    Сегодня к {s.time}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>

        <p className="text-[11px] leading-relaxed text-slate-500">
          Оплата при получении. Точное время выдачи подтвердит бариста после оформления заявки.
        </p>
      </div>

      <button
        type="button"
        onClick={onCheckout}
        disabled={step !== 3}
        className="mt-5 w-full min-h-[52px] px-4 rounded-xl bg-brand hover:bg-brand-dark disabled:bg-brand/45 disabled:cursor-not-allowed text-white font-bold transition inline-flex items-center justify-center gap-2"
      >
        {ctaLabel}
        {step === 3 && <span className="opacity-80">· {cart.totalSum} ₽</span>}
        <ArrowIcon className="w-4 h-4" />
      </button>
      <p className="mt-3 text-center text-[11px] text-slate-500">Без онлайн-оплаты · предзаказ на самовывоз</p>

      <div className="mt-5 rounded-2xl bg-brand-surface px-4 py-3">
        <div className="text-xs font-bold text-slate-900">Любимый напиток — по твоим правилам</div>
        <div className="mt-1 text-[11px] text-slate-500">
          Размер · молоко · сироп. Выбирай сочетание при добавлении в заказ.
        </div>
      </div>
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div aria-label="Загрузка каталога" className="mt-7 space-y-6">
      <div className="flex gap-2.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[42px] w-28 rounded-full bg-white animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-white rounded-2xl h-72 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Иконки ───────────────────────── */

type IconProps = { className?: string };
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function ArrowIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke} strokeWidth={2.2}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function BoltIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}
function PinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}
function UserIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
function CartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2" />
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </svg>
  );
}
function CupIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke} strokeWidth={1.5}>
      <path d="M6 7h12l-1.3 13a1 1 0 0 1-1 .9H8.3a1 1 0 0 1-1-.9L6 7z" />
      <path d="M5 4h14v3H5z" />
      <path d="M9 11h6M9.5 14.5h5" />
    </svg>
  );
}
function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke} strokeWidth={1.5}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m7.5 12.5 3 3 6-6.5" />
    </svg>
  );
}
function SlidersIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}
function ServiceIcon({ type, className }: IconProps & { type: PromoServiceBlock['imageType'] }) {
  if (type === 'ev-charge') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke} strokeWidth={1.5}>
        <rect x="4" y="3" width="10" height="18" rx="1.5" />
        <path d="M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-2-2" />
        <path d="m10 7-2.5 4h3L8 15" />
      </svg>
    );
  }
  if (type === 'scooter') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke} strokeWidth={1.5}>
        <circle cx="5.5" cy="17.5" r="2.5" />
        <circle cx="18.5" cy="17.5" r="2.5" />
        <path d="M8 17.5h7.5L17 6h2.5M15.5 6H17" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke} strokeWidth={1.5}>
      <path d="M3 15v-3l2-5h14l2 5v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M3 12h18" />
      <circle cx="7" cy="16.5" r="1.5" />
      <circle cx="17" cy="16.5" r="1.5" />
      {type === 'taxi' && <path d="M10 4h4v3" />}
    </svg>
  );
}
