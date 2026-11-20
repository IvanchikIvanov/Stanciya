import type { SettingDefinition } from '@/core/types';

export const COFFEE_SETTING_KEYS = {
  maxActiveOrdersPerPhone: 'coffee.maxActiveOrdersPerPhone',
  callConfirmThreshold: 'coffee.callConfirmThreshold',
} as const;

export const COFFEE_SETTINGS: SettingDefinition[] = [
  {
    key: COFFEE_SETTING_KEYS.maxActiveOrdersPerPhone,
    moduleId: 'coffee',
    group: 'Заказы кофе',
    label: 'Одновременных заказов на один номер телефона',
    hint: '0 — без ограничения. Активными считаются все заказы, кроме выданных и отменённых.',
    type: 'integer',
    defaultValue: 0,
    min: 0,
    max: 20,
  },
  {
    key: COFFEE_SETTING_KEYS.callConfirmThreshold,
    moduleId: 'coffee',
    group: 'Заказы кофе',
    label: 'Звонок гостю для заказов дороже',
    hint: 'Такой заказ бариста принимает только после звонка гостю. 0 — звонок не требуется.',
    type: 'integer',
    defaultValue: 1000,
    min: 0,
    max: 1_000_000,
    unit: '₽',
  },
];
