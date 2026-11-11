import React from 'react';
import Link from 'next/link';

interface LogoProps {
  variant?: 'light' | 'dark';
  href?: string;
  subtitle?: string;
}

export function Logo({ variant = 'light', href = '/', subtitle }: LogoProps) {
  const isLight = variant === 'light';
  const content = (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span
        className={`inline-flex items-center justify-center w-9 h-9 rounded-xl font-bold shadow-sm ${
          isLight
            ? 'bg-brand-accent text-brand-deep'
            : 'bg-brand text-white'
        }`}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-5 h-5"
        >
          <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={`text-lg font-extrabold tracking-wider uppercase ${
            isLight ? 'text-white' : 'text-slate-900'
          }`}
        >
          СТАНЦИЯ
        </span>
        {subtitle && (
          <span
            className={`text-[11px] font-medium mt-0.5 ${
              isLight ? 'text-blue-100' : 'text-slate-500'
            }`}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent rounded-xl"
    >
      {content}
    </Link>
  );
}
