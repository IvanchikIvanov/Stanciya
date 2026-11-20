import React from 'react';
import Link from 'next/link';

interface LogoProps {
  /** light — для тёмного или синего фона (белые буквы), dark — для светлого фона */
  variant?: 'light' | 'dark';
  href?: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
}

const HEIGHTS: Record<NonNullable<LogoProps['size']>, string> = {
  sm: 'h-6',
  md: 'h-7',
  lg: 'h-8 sm:h-9',
};

export function Logo({ variant = 'dark', href = '/', subtitle, size = 'md' }: LogoProps) {
  const isLight = variant === 'light';
  const content = (
    <span className="inline-flex items-center gap-3 select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={isLight ? '/brand/logo-white.png' : '/brand/logo.png'}
        alt="СТАНЦИЯ"
        className={`${HEIGHTS[size]} w-auto`}
      />
      {subtitle && (
        <span
          className={`hidden sm:inline-block pl-3 border-l text-xs font-semibold leading-tight ${
            isLight ? 'border-white/30 text-white/80' : 'border-slate-300 text-slate-500'
          }`}
        >
          {subtitle}
        </span>
      )}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      {content}
    </Link>
  );
}
