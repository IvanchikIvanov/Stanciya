import { query, transaction } from '../db';
import { AppError } from '../errors';
import { getRegisteredModules, PROMO_SERVICE_BLOCKS } from '../modules';
import type { PromoServiceBlock, SettingDefinition, SettingValue } from '../types';

/** Настройки ядра: ссылки промоблоков сервисов на главной (п. 4.6 ТЗ). */
export function getCoreSettingDefinitions(): SettingDefinition[] {
  return PROMO_SERVICE_BLOCKS.map((block) => ({
    key: `core.promo.${block.id}.href`,
    moduleId: 'core',
    group: 'Промоблоки на главной',
    label: block.title,
    hint: 'Ссылка предоставляется заказчиком. Пока поле пустое, блок на главной не показывается.',
    type: 'url' as const,
    defaultValue: '',
  }));
}

export function getAllSettingDefinitions(): SettingDefinition[] {
  // Сначала правила модулей, затем общие настройки ядра
  const defs: SettingDefinition[] = [];
  for (const mod of getRegisteredModules()) {
    defs.push(...(mod.settings ?? []));
  }
  return [...defs, ...getCoreSettingDefinitions()];
}

function findDefinition(key: string): SettingDefinition | undefined {
  return getAllSettingDefinitions().find((d) => d.key === key);
}

function parseStored(def: SettingDefinition, raw: string | undefined): number | string {
  if (raw === undefined) return def.defaultValue;
  if (def.type === 'integer') {
    const n = Number(raw);
    return Number.isInteger(n) ? n : def.defaultValue;
  }
  return raw;
}

async function readRawSettings(keys?: string[]): Promise<Map<string, string>> {
  const res = keys
    ? await query<{ key: string; value: string }>(
        'SELECT key, value FROM platform_settings WHERE key = ANY($1::text[])',
        [keys]
      )
    : await query<{ key: string; value: string }>('SELECT key, value FROM platform_settings');
  return new Map(res.rows.map((r) => [r.key, r.value]));
}

/** Возвращает значение настройки или значение по умолчанию из её описания. */
export async function getSetting(key: string, fallback?: number | string): Promise<number | string> {
  const def = findDefinition(key);
  const raw = (await readRawSettings([key])).get(key);
  if (!def) {
    if (raw !== undefined) return raw;
    if (fallback === undefined) throw new Error(`Неизвестная настройка: ${key}`);
    return fallback;
  }
  return parseStored(def, raw);
}

export async function getIntegerSetting(key: string, fallback: number): Promise<number> {
  const v = await getSetting(key, fallback);
  return typeof v === 'number' ? v : fallback;
}

export async function listSettings(): Promise<SettingValue[]> {
  const defs = getAllSettingDefinitions();
  const raw = await readRawSettings();
  return defs.map((def) => ({ ...def, value: parseStored(def, raw.get(def.key)) }));
}

function validateValue(def: SettingDefinition, value: unknown): string {
  if (def.type === 'integer') {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isInteger(n)) {
      throw new AppError(400, 'VALIDATION_ERROR', `«${def.label}»: введите целое число`, {
        [def.key]: 'Введите целое число',
      });
    }
    if ((def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)) {
      const msg = `Допустимо от ${def.min ?? '−∞'} до ${def.max ?? '∞'}`;
      throw new AppError(400, 'VALIDATION_ERROR', `«${def.label}»: ${msg}`, { [def.key]: msg });
    }
    return String(n);
  }

  const s = typeof value === 'string' ? value.trim() : '';
  if (s === '') return '';
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', `«${def.label}»: введите полный адрес ссылки`, {
      [def.key]: 'Ссылка должна начинаться с https://',
    });
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AppError(400, 'VALIDATION_ERROR', `«${def.label}»: допустимы только ссылки http и https`, {
      [def.key]: 'Ссылка должна начинаться с https://',
    });
  }
  return url.toString();
}

/** Сохраняет переданные настройки целиком: либо все, либо ни одной. */
export async function updateSettings(
  values: Record<string, unknown>,
  actorUserId: number
): Promise<SettingValue[]> {
  const prepared: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(values)) {
    const def = findDefinition(key);
    if (!def) {
      throw new AppError(400, 'UNKNOWN_SETTING', `Неизвестная настройка: ${key}`);
    }
    prepared.push([key, validateValue(def, value)]);
  }

  await transaction(async (tx) => {
    for (const [key, value] of prepared) {
      await tx.query(
      `INSERT INTO platform_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [key, value, actorUserId]
      );
    }
  });

  return listSettings();
}

/** Промоблоки с заданной ссылкой; блок без ссылки не показывается (п. 4.6 ТЗ). */
export async function getActivePromoBlocks(): Promise<PromoServiceBlock[]> {
  const raw = await readRawSettings(PROMO_SERVICE_BLOCKS.map((b) => `core.promo.${b.id}.href`));
  return PROMO_SERVICE_BLOCKS.map((block) => ({
    ...block,
    href: (raw.get(`core.promo.${block.id}.href`) ?? '').trim(),
  })).filter((block) => block.href !== '');
}
