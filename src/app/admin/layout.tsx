import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getAdminNavigation } from '@/core/modules';
import { AccessDeniedView } from '@/core/ui/AccessDeniedView';
import '@/modules';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/staff/login');
  }

  if (user.role !== 'admin') {
    return (
      <AccessDeniedView
        backHref={user.role === 'barista' ? '/barista' : '/'}
        backLabel={user.role === 'barista' ? 'В панель бариста' : 'На главную'}
      />
    );
  }

  const navItems = getAdminNavigation();

  return (
    <div className="min-h-screen bg-brand-surface flex flex-col">
      <header className="bg-brand-deep text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <a href="/admin" className="font-extrabold text-lg tracking-wider flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-brand-accent text-brand-deep text-sm">
                ⚡
              </span>
              <span>СТАНЦИЯ · АДМИН</span>
            </a>
            <nav className="flex flex-wrap items-center gap-1" aria-label="Меню администратора">
              {navItems.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold text-blue-100 hover:bg-white/15 hover:text-white transition"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-blue-200">{user.name}</span>
            <a
              href="/"
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold"
            >
              Витрина
            </a>
          </div>
        </div>
      </header>
      <main className="max-w-7xl w-full mx-auto px-4 py-6 flex-1">{children}</main>
    </div>
  );
}
