import Link from 'next/link';
import { Logo } from '@/core/ui/Logo';
import { RecentOrderBanner } from '@/modules/coffee/orders/RecentOrderBanner';

export default function OrdersPage() {
  return (
    <div className="min-h-screen bg-brand-surface flex flex-col">
      <header className="bg-white/90 backdrop-blur border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo variant="dark" />
          <Link
            href="/"
            className="px-3.5 py-2 rounded-btn border border-slate-300 bg-white text-slate-800 hover:border-brand hover:text-brand text-xs sm:text-sm font-bold transition"
          >
            В каталог
          </Link>
        </div>
      </header>

      <main className="max-w-3xl w-full mx-auto px-4 py-6 space-y-5 flex-1">
        <h1 className="text-2xl font-extrabold text-slate-900">Мои заказы</h1>

        <RecentOrderBanner />

        <section className="bg-white rounded-panel p-5 sm:p-6 shadow-card border border-blue-100 space-y-3">
          <h2 className="text-base font-extrabold text-slate-900">Открыть заказ</h2>
          <p className="text-sm text-slate-600">
            Откройте персональную ссылку, которую вы сохранили после оформления.
            Если заказ сохранён в профиле, он будет в истории заказов.
          </p>
          <Link href="/profile" className="inline-flex min-h-11 items-center font-bold text-sm text-brand underline underline-offset-2">
            Открыть профиль
          </Link>
        </section>
      </main>
    </div>
  );
}
