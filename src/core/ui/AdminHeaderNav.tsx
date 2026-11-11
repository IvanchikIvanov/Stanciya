'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { AdminNavItem } from '../types';

interface AdminHeaderNavProps {
  navItems: AdminNavItem[];
  userName: string;
}

export function AdminHeaderNav({ navItems, userName }: AdminHeaderNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/core/auth/logout', { method: 'POST' });
    router.push('/staff/login');
  }

  return (
    <header className="bg-brand-deep text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5">
          <Link
            href="/admin/orders"
            className="font-extrabold text-base sm:text-lg tracking-wider flex items-center gap-2"
          >
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-accent text-brand-deep text-sm font-black">
              ⚡
            </span>
            <span>СТАНЦИЯ · АДМИН</span>
          </Link>

          <nav className="flex flex-wrap items-center gap-1" aria-label="Меню администратора">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`px-3.5 py-2 rounded-lg text-sm font-bold transition ${
                    active
                      ? 'bg-brand text-white shadow-xs'
                      : 'text-blue-100 hover:bg-white/15 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          <span className="text-blue-200 font-semibold hidden sm:inline">
            {userName}
          </span>
          <Link
            href="/barista"
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold"
          >
            Очередь бариста
          </Link>
          <Link
            href="/"
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold"
          >
            Витрина
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-600 text-white font-bold"
          >
            Выход
          </button>
        </div>
      </div>
    </header>
  );
}
