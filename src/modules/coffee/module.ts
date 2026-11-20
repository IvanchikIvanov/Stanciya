import type { PlatformModule } from '@/core/types';
import { attachGuestOrderToUserByAccessKey } from './orders/service';
import { COFFEE_SETTINGS } from './settings/definitions';
import { getCoffeeStatsBlock } from './stats/service';

export const coffeeModule: PlatformModule = {
  id: 'coffee',
  title: 'Кофе и маркет',
  serviceCode: 'coffee',
  adminNavItems: [
    {
      id: 'coffee-catalog',
      label: 'Каталог',
      href: '/admin/catalog',
      moduleId: 'coffee',
      order: 10,
    },
    {
      id: 'coffee-modifiers',
      label: 'Модификаторы',
      href: '/admin/modifiers',
      moduleId: 'coffee',
      order: 20,
    },
    {
      id: 'coffee-orders',
      label: 'Заказы',
      href: '/admin/orders',
      moduleId: 'coffee',
      order: 50,
    },
  ],
  homeBlock: {
    moduleId: 'coffee',
    title: 'Кофе по пути. Закажи заранее. Забери без ожидания',
    subtitle: 'Свежий кофе и выпечка к вашему приезду на точки «СТАНЦИЯ» в Миассе',
    href: '/',
  },
  getStatsBlock: getCoffeeStatsBlock,
  attachGuestOrderToUser: attachGuestOrderToUserByAccessKey,
  settings: COFFEE_SETTINGS,
};
