import React from 'react';

interface ProductPlaceholderProps {
  name: string;
  imageUrl?: string | null;
  className?: string;
}

export function ProductPlaceholder({
  name,
  imageUrl,
  className = 'w-full h-36',
}: ProductPlaceholderProps) {
  if (imageUrl) {
    return (
      <div className={`relative overflow-hidden bg-brand-light ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-brand-light via-blue-100 to-brand-muted flex flex-col items-center justify-center p-3 text-center select-none ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-white/85 text-brand flex items-center justify-center shadow-sm mb-1.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
          <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
          <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
          <line x1="6" y1="2" x2="6" y2="4" />
          <line x1="10" y1="2" x2="10" y2="4" />
          <line x1="14" y1="2" x2="14" y2="4" />
        </svg>
      </div>
      <span className="text-[11px] font-bold text-brand-deep/75 tracking-wide uppercase">
        СТАНЦИЯ
      </span>
    </div>
  );
}
