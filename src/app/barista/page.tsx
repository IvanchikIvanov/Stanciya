import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/core/auth/session';
import { listAdminPoints } from '@/core/points/service';
import { BaristaBoard } from '@/modules/coffee/barista/BaristaBoard';

export default async function BaristaPage() {
  const user = await getCurrentUser();

  if (!user || (user.role !== 'barista' && user.role !== 'admin')) {
    redirect('/staff/login');
  }

  let effectivePointId = user.pointId;
  let effectivePointName = user.pointName || 'Точка СТАНЦИЯ';

  if (!effectivePointId && user.role === 'admin') {
    const pts = await listAdminPoints();
    if (pts.length > 0) {
      effectivePointId = pts[0].id;
      effectivePointName = pts[0].name;
    }
  }

  if (!effectivePointId) {
    return (
      <div className="min-h-screen bg-brand-surface flex items-center justify-center p-4">
        <div className="bg-white rounded-panel p-8 shadow-card max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-extrabold text-slate-900">
            Вам не назначена точка
          </h1>
          <p className="text-sm text-slate-600">
            Обратитесь к администратору для привязки вашей учётной записи к точке «СТАНЦИЯ».
          </p>
          <a
            href="/staff/login"
            className="inline-block px-5 py-2.5 rounded-btn bg-brand text-white font-bold text-sm"
          >
            На страницу входа
          </a>
        </div>
      </div>
    );
  }

  return (
    <BaristaBoard
      initialPointName={effectivePointName}
      staffName={user.name}
      isAdmin={user.role === 'admin'}
    />
  );
}
