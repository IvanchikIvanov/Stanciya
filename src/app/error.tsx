'use client';

import React from 'react';
import { Logo } from '@/core/ui/Logo';

export default function GlobalErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-brand-surface flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-panel shadow-card max-w-md w-full p-8 text-center border border-red-100 space-y-4">
        <div className="flex justify-center">
          <Logo variant="dark" />
        </div>
        <h1 className="text-xl font-extrabold text-slate-900">
          Не удалось загрузить
        </h1>
        <p className="text-sm text-slate-600">
          Произошла ошибка при обработке запроса. Попробуйте повторить действие.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="px-6 py-3 rounded-btn bg-brand hover:bg-brand-dark text-white font-bold text-sm transition"
        >
          Повторить
        </button>
      </div>
    </div>
  );
}
