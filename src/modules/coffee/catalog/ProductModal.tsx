'use client';

import React, { useMemo, useState } from 'react';
import { ProductPlaceholder } from '@/core/ui/ProductPlaceholder';
import type { CatalogProductDto } from './service';
import type { CartLineItem, CartModifierItem } from './cart-store';

interface ProductModalProps {
  product: CatalogProductDto;
  onClose: () => void;
  onAdd: (item: Omit<CartLineItem, 'key'>) => void;
}

export function ProductModal({ product, onClose, onAdd }: ProductModalProps) {
  const initialSelected = useMemo(() => {
    const map: Record<number, number[]> = {};
    for (const grp of product.modifierGroups) {
      if (grp.isRequired) {
        const def =
          grp.options.find((o) => o.isDefault && o.isAvailable) ??
          grp.options.find((o) => o.isAvailable);
        map[grp.id] = def ? [def.id] : [];
      } else {
        const defs = grp.options.filter((o) => o.isDefault && o.isAvailable).map((o) => o.id);
        map[grp.id] = grp.selectType === 'single' ? defs.slice(0, 1) : defs;
      }
    }
    return map;
  }, [product]);

  const [selectedByGroup, setSelectedByGroup] =
    useState<Record<number, number[]>>(initialSelected);
  const [quantity, setQuantity] = useState(1);

  function toggleOption(
    groupId: number,
    optionId: number,
    selectType: 'single' | 'multiple',
    isRequired: boolean
  ) {
    setSelectedByGroup((prev) => {
      const current = prev[groupId] ?? [];
      const exists = current.includes(optionId);

      if (selectType === 'single') {
        if (exists) {
          // В обязательной группе снять выбор нельзя
          if (isRequired) return prev;
          return { ...prev, [groupId]: [] };
        }
        return { ...prev, [groupId]: [optionId] };
      }

      // multiple
      if (exists) {
        if (isRequired && current.length <= 1) {
          return prev;
        }
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      }
      return { ...prev, [groupId]: [...current, optionId] };
    });
  }

  const { unitPrice, totalPrice, selectedModifiers, allOptionIds, canSubmit } =
    useMemo(() => {
      let delta = 0;
      const mods: CartModifierItem[] = [];
      const optIds: number[] = [];
      let valid = product.inStock;

      for (const grp of product.modifierGroups) {
        const chosenIds = selectedByGroup[grp.id] ?? [];
        if (grp.isRequired && chosenIds.length === 0) {
          valid = false;
        }
        for (const id of chosenIds) {
          const opt = grp.options.find((o) => o.id === id);
          if (opt && opt.isAvailable) {
            delta += opt.priceDelta;
            optIds.push(opt.id);
            mods.push({
              groupId: grp.id,
              groupName: grp.name,
              optionId: opt.id,
              optionName: opt.name,
              priceDelta: opt.priceDelta,
            });
          } else {
            valid = false;
          }
        }
      }

      const uPrice = product.basePrice + delta;
      return {
        unitPrice: uPrice,
        totalPrice: uPrice * quantity,
        selectedModifiers: mods,
        allOptionIds: optIds,
        canSubmit: valid,
      };
    }, [product, selectedByGroup, quantity]);

  function handleAddToCart() {
    if (!canSubmit) return;
    onAdd({
      productId: product.id,
      productName: product.name,
      imageUrl: product.imageUrl,
      optionIds: allOptionIds,
      modifiers: selectedModifiers,
      unitPrice,
      quantity,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-product-title"
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-panel sm:rounded-panel shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <ProductPlaceholder
            name={product.name}
            imageUrl={product.imageUrl}
            className="w-full h-48 sm:h-56"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть карточку товара"
            className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-slate-800 font-bold shadow-md flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          <div>
            <h2 id="modal-product-title" className="text-xl font-extrabold text-slate-900">
              {product.name}
            </h2>
            {product.description && (
              <p className="text-sm text-slate-600 mt-1">{product.description}</p>
            )}
          </div>

          {product.modifierGroups.map((grp) => {
            const chosenIds = selectedByGroup[grp.id] ?? [];
            return (
              <div key={grp.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">{grp.name}</span>
                  <span className="text-xs font-medium text-slate-500">
                    {grp.isRequired ? 'Обязательно' : 'Необязательно'}
                    {grp.selectType === 'multiple' ? ' · можно несколько' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {grp.options.map((opt) => {
                    const isSelected = chosenIds.includes(opt.id);
                    const disabled = !opt.isAvailable;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          toggleOption(grp.id, opt.id, grp.selectType, grp.isRequired)
                        }
                        className={`px-3.5 py-2.5 rounded-btn border text-left text-sm transition flex items-center justify-between gap-2 ${
                          disabled
                            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                            : isSelected
                            ? 'bg-brand-light border-brand text-brand-deep font-bold shadow-xs'
                            : 'bg-white border-slate-200 text-slate-800 hover:border-blue-300'
                        }`}
                      >
                        <span className="truncate">{opt.name}</span>
                        <span className="text-xs shrink-0 font-semibold">
                          {opt.priceDelta > 0 ? `+${opt.priceDelta} ₽` : '0 ₽'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3">
          <div className="flex items-center bg-white border border-slate-300 rounded-btn p-1">
            <button
              type="button"
              disabled={quantity <= 1}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Уменьшить количество"
              className="w-10 h-10 rounded-xl font-bold text-lg text-slate-700 disabled:opacity-35 hover:bg-slate-100"
            >
              −
            </button>
            <span className="w-9 text-center font-extrabold text-slate-900 text-sm">
              {quantity}
            </span>
            <button
              type="button"
              disabled={quantity >= 20}
              onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              aria-label="Увеличить количество"
              className="w-10 h-10 rounded-xl font-bold text-lg text-slate-700 disabled:opacity-35 hover:bg-slate-100"
            >
              +
            </button>
          </div>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleAddToCart}
            className="flex-1 min-h-[48px] py-3 px-5 rounded-btn bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-between shadow-sm transition"
          >
            <span>В корзину</span>
            <span>{totalPrice} ₽</span>
          </button>
        </div>
      </div>
    </div>
  );
}
