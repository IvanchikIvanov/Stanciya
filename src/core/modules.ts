import type {
  AdminNavItem,
  ModuleHomeBlock,
  ModuleStatsBlockData,
  PlatformModule,
  PromoServiceBlock,
  StatsFilterParams,
} from './types';

const moduleRegistry = new Map<string, PlatformModule>();

export function registerModule(mod: PlatformModule): void {
  moduleRegistry.set(mod.id, mod);
}

export function getRegisteredModules(): PlatformModule[] {
  return Array.from(moduleRegistry.values());
}

export function getModuleById(id: string): PlatformModule | undefined {
  return moduleRegistry.get(id);
}

const CORE_ADMIN_NAV: AdminNavItem[] = [
  { id: 'core-points', label: 'Точки', href: '/admin/points', moduleId: 'core', order: 30 },
  { id: 'core-staff', label: 'Сотрудники', href: '/admin/staff', moduleId: 'core', order: 40 },
  { id: 'core-stats', label: 'Показатели', href: '/admin/stats', moduleId: 'core', order: 60 },
  { id: 'core-settings', label: 'Настройки', href: '/admin/settings', moduleId: 'core', order: 70 },
];

export function getAdminNavigation(): AdminNavItem[] {
  const items: AdminNavItem[] = [...CORE_ADMIN_NAV];
  for (const mod of moduleRegistry.values()) {
    items.push(...mod.adminNavItems);
  }
  return items.sort((a, b) => a.order - b.order);
}

export function getHomeBlocks(): ModuleHomeBlock[] {
  return Array.from(moduleRegistry.values()).map((m) => m.homeBlock);
}

export async function collectModulesStats(
  params: StatsFilterParams
): Promise<ModuleStatsBlockData[]> {
  const blocks: ModuleStatsBlockData[] = [];
  for (const mod of moduleRegistry.values()) {
    if (mod.getStatsBlock) {
      blocks.push(await mod.getStatsBlock(params));
    }
  }
  return blocks;
}

export async function attachGuestOrderAcrossModules(
  accessKey: string,
  userId: number
): Promise<void> {
  for (const mod of moduleRegistry.values()) {
    if (mod.attachGuestOrderToUser) {
      await mod.attachGuestOrderToUser(accessKey, userId);
    }
  }
}

// Ссылки промоблоков задаёт администратор в разделе «Настройки» (core.promo.<id>.href).
export const PROMO_SERVICE_BLOCKS: PromoServiceBlock[] = [
  {
    id: 'ev-charge',
    title: 'Зарядка автомобиля',
    description: 'Быстрые ЭЗС на точках «СТАНЦИЯ» в Миассе — заряжайтесь пока пьёте кофе',
    imageType: 'ev-charge',
    href: '',
    isExternal: true,
  },
  {
    id: 'miass-taxi',
    title: 'Миасс Такси',
    description: 'Комфортные поездки по городу и окрестностям на электромобилях',
    imageType: 'taxi',
    href: '',
    isExternal: true,
  },
  {
    id: 'scooters',
    title: 'Электросамокаты',
    description: 'Поминутный прокат городских электросамокатов от точек «СТАНЦИЯ»',
    imageType: 'scooter',
    href: '',
    isExternal: true,
  },
  {
    id: 'evolute',
    title: 'Электромобили Evolute',
    description: 'Тест-драйв, покупка и обслуживание электромобилей Evolute',
    imageType: 'evolute',
    href: '',
    isExternal: true,
  },
];

