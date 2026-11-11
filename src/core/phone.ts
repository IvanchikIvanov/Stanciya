import { AppError } from './errors';

/**
 * Нормализует российский номер телефона к формату +7XXXXXXXXXX.
 * Возвращает null, если номер некорректен.
 */
export function normalizeRussianPhone(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 10 && digits.startsWith('9')) {
    return `+7${digits}`;
  }

  return null;
}

export function requireNormalizedPhone(raw: string, fieldName = 'phone'): string {
  const normalized = normalizeRussianPhone(raw);
  if (!normalized) {
    throw new AppError(400, 'INVALID_PHONE', 'Введите корректный российский номер телефона (+7XXXXXXXXXX)', {
      [fieldName]: 'Введите номер в формате +7 (XXX) XXX-XX-XX',
    });
  }
  return normalized;
}

export function formatPhoneDisplay(phone: string): string {
  const norm = normalizeRussianPhone(phone) ?? phone;
  const m = norm.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (!m) return phone;
  return `+7 (${m[1]}) ${m[2]}-${m[3]}-${m[4]}`;
}
