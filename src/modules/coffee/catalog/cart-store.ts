'use client';

import { useCallback, useEffect, useState } from 'react';

export interface CartModifierItem {
  groupId: number;
  groupName: string;
  optionId: number;
  optionName: string;
  priceDelta: number;
}

export interface CartLineItem {
  key: string; // `${productId}:${sortedOptionIds.join(',')}`
  productId: number;
  productName: string;
  imageUrl: string | null;
  optionIds: number[];
  modifiers: CartModifierItem[];
  unitPrice: number;
  quantity: number;
  available?: boolean;
}

const CART_STORAGE_KEY = 'stanciya_cart_v1';
const POINT_STORAGE_KEY = 'stanciya_selected_point_v1';
const CART_EVENT_NAME = 'stanciya-cart-updated';

export function buildCartLineKey(productId: number, optionIds: number[]): string {
  const sorted = [...optionIds].sort((a, b) => a - b);
  return `${productId}:${sorted.join(',')}`;
}

export function readCartFromStorage(): CartLineItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function writeCartToStorage(items: CartLineItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(CART_EVENT_NAME));
  } catch {
    // ignore storage quota errors
  }
}

export function addToCartStorage(newItem: Omit<CartLineItem, 'key'>): CartLineItem[] {
  const current = readCartFromStorage();
  const sortedOptionIds = [...newItem.optionIds].sort((a, b) => a - b);
  const key = buildCartLineKey(newItem.productId, sortedOptionIds);

  const existingIndex = current.findIndex((item) => item.key === key);
  if (existingIndex >= 0) {
    const existing = current[existingIndex];
    const nextQty = Math.min(20, existing.quantity + newItem.quantity);
    current[existingIndex] = {
      ...existing,
      quantity: nextQty,
      unitPrice: newItem.unitPrice,
      modifiers: newItem.modifiers,
      available: true,
    };
  } else {
    current.push({
      ...newItem,
      optionIds: sortedOptionIds,
      key,
      quantity: Math.min(20, Math.max(1, newItem.quantity)),
      available: true,
    });
  }

  writeCartToStorage(current);
  return current;
}

export function updateCartLineQuantity(key: string, nextQuantity: number): CartLineItem[] {
  const current = readCartFromStorage();
  if (nextQuantity <= 0) {
    const filtered = current.filter((item) => item.key !== key);
    writeCartToStorage(filtered);
    return filtered;
  }

  const clamped = Math.min(20, nextQuantity);
  const updated = current.map((item) =>
    item.key === key ? { ...item, quantity: clamped } : item
  );
  writeCartToStorage(updated);
  return updated;
}

export function removeCartLine(key: string): CartLineItem[] {
  const current = readCartFromStorage();
  const filtered = current.filter((item) => item.key !== key);
  writeCartToStorage(filtered);
  return filtered;
}

export function clearCartStorage(): void {
  writeCartToStorage([]);
}

export function getSelectedPointIdFromStorage(): number | null {
  if (typeof window === 'undefined') return null;
  const val = window.localStorage.getItem(POINT_STORAGE_KEY);
  if (!val) return null;
  const num = Number(val);
  return Number.isInteger(num) && num > 0 ? num : null;
}

export function setSelectedPointIdInStorage(pointId: number | null): void {
  if (typeof window === 'undefined') return;
  if (pointId === null) {
    window.localStorage.removeItem(POINT_STORAGE_KEY);
  } else {
    window.localStorage.setItem(POINT_STORAGE_KEY, String(pointId));
  }
}

const PICKUP_STORAGE_KEY = 'stanciya_pickup_choice_v1';

/** Время получения, выбранное на главной: «как можно скорее» или слот ЧЧ:ММ. */
export interface PickupChoice {
  isAsap: boolean;
  time: string | null;
}

export function getPickupChoiceFromStorage(): PickupChoice | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PICKUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.isAsap !== 'boolean') return null;
    return { isAsap: parsed.isAsap, time: typeof parsed.time === 'string' ? parsed.time : null };
  } catch {
    return null;
  }
}

export function setPickupChoiceInStorage(choice: PickupChoice | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (choice === null) window.sessionStorage.removeItem(PICKUP_STORAGE_KEY);
    else window.sessionStorage.setItem(PICKUP_STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // хранилище недоступно (приватный режим) — выбор просто не переносится
  }
}

export function useCart() {
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const sync = useCallback(() => {
    setItems(readCartFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    sync();
    const onStorage = () => sync();
    window.addEventListener(CART_EVENT_NAME, onStorage);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CART_EVENT_NAME, onStorage);
      window.removeEventListener('storage', onStorage);
    };
  }, [sync]);

  const totalCount = items.reduce((acc, i) => acc + i.quantity, 0);
  const totalSum = items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

  return {
    items,
    hydrated,
    totalCount,
    totalSum,
    addItem: (item: Omit<CartLineItem, 'key'>) => setItems(addToCartStorage(item)),
    setQuantity: (key: string, qty: number) => setItems(updateCartLineQuantity(key, qty)),
    removeItem: (key: string) => setItems(removeCartLine(key)),
    replaceAll: (next: CartLineItem[]) => {
      writeCartToStorage(next);
      setItems(next);
    },
    clear: () => {
      clearCartStorage();
      setItems([]);
    },
  };
}
