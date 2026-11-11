import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { getAdminNavigation } from '@/core/modules';
import { AccessDeniedView } from '@/core/ui/AccessDeniedView';
import { AdminHeaderNav } from '@/core/ui/AdminHeaderNav';
import { NetworkBanner } from '@/core/ui/NetworkBanner';
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
      <NetworkBanner />
      <AdminHeaderNav navItems={navItems} userName={user.name} />
      <main className="max-w-7xl w-full mx-auto px-4 py-6 flex-1">{children}</main>
    </div>
  );
}
