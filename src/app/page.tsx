import React from 'react';
import { Logo } from '@/core/ui/Logo';
import { getActivePromoBlocks, getHomeBlocks } from '@/core/modules';
import '@/modules';

export default function HomePage() {
  const homeBlocks = getHomeBlocks();
  const promoBlocks = getActivePromoBlocks();
  const hero = homeBlocks[0];

  return (
    <div className="min-h-screen flex flex-col pb-24">
      <header className="bg-brand text-white rounded-b-panel shadow-md">
        <div className="max-w-5xl mx-auto px-4 pt-4 pb-6">
          <div className="flex items-center justify-between mb-5">
            <Logo variant="light" subtitle="г. Миасс" />
            <a
              href="/login"
              className="px-4 py-2 rounded-btn bg-white/15 hover:bg-white/25 text-sm font-semibold transition"
            >
              Войти
            </a>
          </div>
          <div className="bg-brand-dark/70 rounded-card p-5 border border-white/15">
            <h1 className="text-xl sm:text-2xl font-extrabold leading-snug">
              {hero?.title ?? 'Кофе по пути. Закажи заранее. Забери без ожидания'}
            </h1>
            <p className="text-blue-100 text-sm mt-1.5">
              {hero?.subtitle ?? 'Предзаказ напитков и еды на точках «СТАНЦИЯ»'}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl w-full mx-auto px-4 mt-6 space-y-8 flex-1">
        <section aria-label="Каталог">
          <h2 className="text-lg font-extrabold text-slate-900 mb-3">Каталог</h2>
          <div className="bg-white rounded-card p-6 shadow-card text-slate-600 text-sm">
            Каркас платформы «СТАНЦИЯ» готов. Каталог подключается на следующих этапах.
          </div>
        </section>

        <section aria-label="Сервисы СТАНЦИЯ">
          <h2 className="text-lg font-extrabold text-slate-900 mb-3">Сервисы «СТАНЦИЯ»</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {promoBlocks.map((promo) => (
              <a
                key={promo.id}
                href={promo.href}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white rounded-card p-4 shadow-card hover:shadow-md transition flex items-center gap-4 border border-blue-100"
              >
                <div className="w-12 h-12 rounded-2xl bg-brand-light text-brand flex items-center justify-center font-extrabold shrink-0">
                  ⚡
                </div>
                <div>
                  <div className="font-bold text-slate-900">{promo.title}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{promo.description}</div>
                </div>
              </a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
