import React from 'react';
import Link from 'next/link';
import { Logo } from '@/core/ui/Logo';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-brand-surface flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-panel shadow-card max-w-md w-full p-8 text-center border border-blue-100">
        <div className="flex justify-center mb-5">
          <Logo variant="dark" />
        </div>
        <div className="text-4xl font-extrabold text-brand mb-2">404</div>
        <h1 className="text-xl font-extrabold text-slate-900 mb-2">
          Страница не найдена
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          Возможно, ссылка устарела или страница была перемещена.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-btn bg-brand hover:bg-brand-dark text-white font-bold text-sm transition"
        >
          В каталог
        </Link>
      </div>
    </div>
  );
}
