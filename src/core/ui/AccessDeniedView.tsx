import React from 'react';
import Link from 'next/link';
import { Logo } from './Logo';

interface AccessDeniedViewProps {
  backHref?: string;
  backLabel?: string;
}

export function AccessDeniedView({
  backHref = '/',
  backLabel = 'На главную',
}: AccessDeniedViewProps) {
  return (
    <div className="min-h-screen bg-brand-surface flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-panel shadow-card max-w-md w-full p-8 text-center border border-blue-100">
        <div className="flex justify-center mb-5">
          <Logo variant="dark" />
        </div>
        <div className="w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
          !
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Нет доступа</h1>
        <p className="text-sm text-slate-600 mb-6">
          У вашей учётной записи недостаточно прав для просмотра этого раздела.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={backHref}
            className="px-5 py-3 rounded-btn bg-brand text-white font-bold text-sm hover:bg-brand-dark transition"
          >
            {backLabel}
          </Link>
          <Link
            href="/staff/login"
            className="px-5 py-3 rounded-btn bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition"
          >
            Сменить аккаунт
          </Link>
        </div>
      </div>
    </div>
  );
}
