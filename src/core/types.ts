export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  moduleId: string;
  order: number;
}

export interface StatsFilterParams {
  period: 'today' | '7d' | '30d' | 'custom';
  from?: string;
  to?: string;
  pointId?: number | null;
}

export interface StatsMetricCard {
  id: string;
  label: string;
  value: string | number;
  hint?: string;
}

export interface StatsPopularItem {
  id: number | string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface ModuleStatsBlockData {
  moduleId: string;
  moduleTitle: string;
  disclaimer?: string;
  metrics: StatsMetricCard[];
  popularItemsTitle?: string;
  popularItems?: StatsPopularItem[];
}

export interface ModuleHomeBlock {
  moduleId: string;
  title: string;
  subtitle: string;
  href: string;
}

export interface PromoServiceBlock {
  id: string;
  title: string;
  description: string;
  imageType: 'ev-charge' | 'taxi' | 'scooter' | 'evolute';
  href: string;
  isExternal: boolean;
}

export interface SettingDefinition {
  /** Уникальный ключ: «<модуль>.<имя>», например coffee.maxActiveOrdersPerPhone */
  key: string;
  moduleId: string;
  /** Название группы в разделе «Настройки» */
  group: string;
  label: string;
  hint?: string;
  type: 'integer' | 'url';
  defaultValue: number | string;
  min?: number;
  max?: number;
  /** Подпись единицы измерения рядом с полем, например «₽» */
  unit?: string;
}

export interface SettingValue extends SettingDefinition {
  value: number | string;
}

export interface PlatformModule {
  id: string;
  title: string;
  serviceCode: string;
  adminNavItems: AdminNavItem[];
  homeBlock: ModuleHomeBlock;
  getStatsBlock?: (params: StatsFilterParams) => Promise<ModuleStatsBlockData>;
  attachGuestOrderToUser?: (accessKey: string, userId: number) => Promise<void>;
  /** Настройки модуля, которые администратор меняет в разделе «Настройки» */
  settings?: SettingDefinition[];
}
