'use client';

import React, { useEffect, useState } from 'react';

interface NetworkBannerProps {
  forceOffline?: boolean;
  customMessage?: string;
}

export function NetworkBanner({ forceOffline = false, customMessage }: NetworkBannerProps) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (isOnline && !forceOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-red-600 text-white text-center text-xs sm:text-sm font-bold py-2.5 px-4 shadow-md"
    >
      {customMessage || 'Нет соединения. Введённые данные сохранены.'}
    </div>
  );
}
