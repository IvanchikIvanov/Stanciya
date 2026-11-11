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

export interface PlatformModule {
  id: string;
  title: string;
  serviceCode: string;
  adminNavItems: AdminNavItem[];
  homeBlock: ModuleHomeBlock;
  getStatsBlock?: (params: StatsFilterParams) => Promise<ModuleStatsBlockData>;
}
