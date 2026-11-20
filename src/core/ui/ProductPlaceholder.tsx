import React from 'react';

interface ProductPlaceholderProps {
  name: string;
  imageUrl?: string | null;
  className?: string;
}

/**
 * Фирменные стаканы из макета лендинга. Показываются, пока администратор
 * не загрузил фото товара (загруженное фото всегда важнее).
 */
const FOOD_RE = /круассан|сэндвич|сендвич|бутерброд|булоч|печень|пирож|торт|десерт|салат|шоколад(?!ный напиток)|сырник|кекс|маффин|вафл/;

function brandCupFor(name: string): string | null {
  const n = name.toLowerCase();
  if (FOOD_RE.test(n)) return null; // для еды стакан не показываем

  if (/латте|флэт|флет|матча|какао|молок/.test(n)) return '/brand/glass-latte.jpg';
  if (/американо|эспрессо|чёрн|черн|фильтр|чай/.test(n)) return '/brand/cup-americano.jpg';
  return '/brand/cup-cappuccino.jpg';
}

export function ProductPlaceholder({
  name,
  imageUrl,
  className = 'w-full h-36',
}: ProductPlaceholderProps) {
  const src = imageUrl || brandCupFor(name);
  const isBrandCup = !imageUrl;

  if (!src) {
    return (
      <div
        className={`relative overflow-hidden bg-[#F3F1EC] flex flex-col items-center justify-center gap-2 text-brand select-none ${className}`}
      >
        <svg viewBox="0 0 24 24" className="w-1/4 max-w-[56px] min-w-[20px] h-auto" fill="currentColor" aria-hidden="true">
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
        <span className="sr-only">{name}</span>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-[#F3F1EC] flex items-center justify-center ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={name}
        loading="lazy"
        className={isBrandCup ? 'h-full w-auto object-contain mix-blend-multiply' : 'w-full h-full object-cover'}
      />
    </div>
  );
}
