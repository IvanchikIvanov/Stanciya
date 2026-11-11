# Архитектура веб-платформы «СТАНЦИЯ»: Ядро и Модули

Платформа спроектирована по принципу **независимого ядра (`src/core`)** и **подключаемых бизнес-модулей (`src/modules/*`)**. Сейчас подключён модуль `coffee` («Кофе и маркет»). В будущем к этой же платформе без переделки кофейного модуля подключаются модули зарядных станций (ЭЗС), такси, проката электросамокатов и электромобилей.

---

## 1. Структура каталогов

```text
app/
  src/
    core/                 # Ядро платформы (НЕ импортирует ничего из src/modules/)
      db.ts               # Единый адаптер БД (pg Pool или @electric-sql/pglite)
      env.ts              # Чтение настроек и флагов окружения
      errors.ts           # Класс AppError для бизнес-ошибок
      http.ts             # Форматирование ответов и ошибок API { error: { code, message, fields? } }
      phone.ts            # Нормализация российских телефонов (+7XXXXXXXXXX)
      time.ts             # Работа с часовым поясом г. Миасс (Asia/Yekaterinburg, UTC+5)
      types.ts            # Контракты PlatformModule, навигации админки, блоков статистики и промо
      modules.ts          # Реестр модулей (registerModule, getAdminNavigation, collectModulesStats)
      auth/               # Хеширование паролей (bcryptjs), сессии (httpOnly cookie), блокировка попыток, rate-limit
      users/              # Профиль клиента, управление сотрудниками, защита единственного админа
      points/             # Точки (станции), их расписание (point_hours), активные сервисы (point_services), расчёт слотов
      ui/                 # Общие UI-компоненты и брендовые токены темы
    modules/
      index.ts            # Точка регистрации всех активных модулей в реестре ядра
      coffee/             # Модуль «Кофе и маркет» (зависит от core, но не наоборот)
        module.ts         # Описание модуля для реестра (id, пункты меню, блок главной, статистика)
        catalog/          # Публичный каталог, модификаторы, проверка корзины, localStorage-хранилище
        orders/           # Оформление заказа, цепочка статусов, отмена, история, счётчик no_show
        barista/          # Панель очереди бариста и звуковые оповещения (Web Audio API)
        admin/            # Управление категориями, товарами, модификаторами и загрузка фото
        stats/            # Расчёт показателей модуля для экрана «Показатели»
    app/                  # Тонкие маршруты Next.js App Router (вызывают сервисы core и modules)
      api/
        core/             # Маршруты API ядра (/api/core/auth/*, /api/core/points, /api/core/admin/*)
        coffee/           # Маршруты API модуля кофе (/api/coffee/catalog, /api/coffee/orders, ...)
  migrations/
    core/                 # SQL-миграции таблиц ядра (users, sessions, points, point_hours, point_services, login_attempts)
    coffee/               # SQL-миграции таблиц модуля (префикс coffee_*)
  scripts/
    migrate.ts            # Раннер миграций по папкам migrations/core и migrations/<module>
    seed.ts               # Идемпотентные сиды начальных данных
```

---

## 2. Ключевые правила изоляции

1. **Однонаправленная зависимость:**
   - `src/core/*` **никогда** не импортирует файлы из `src/modules/*`.
   - Модули в `src/modules/<name>/*` используют адаптер базы `@/core/db`, сессии `@/core/auth/session`, точки `@/core/points/service` и регистрируют себя в `@/core/modules`.
2. **Префиксы таблиц БД:**
   - Таблицы ядра не имеют модульного префикса (`users`, `sessions`, `points`, `point_hours`, `point_services`, `login_attempts`).
   - Все таблицы модуля обязаны иметь префикс `<module>_` (например, `coffee_categories`, `coffee_products`, `coffee_orders`).
3. **Сервисы точки (`point_services`):**
   - Каждая станция (`points`) хранит список включённых на ней сервисов в таблице `point_services (point_id, service)`.
   - Для кофейни проверяется наличие сервиса `'coffee'`, для зарядной станции будет проверяться `'ev_charge'` и т.д.
4. **Расширяемые роли:**
   - Поле `users.role` хранится строкой (`'client'`, `'barista'`, `'admin'`). Новая роль (например, `'dispatcher'` или `'technician'`) добавляется без изменения таблицы `users` и функции `requireRole([...])`.
5. **Динамическая сборка админ-панели и экрана «Показатели»:**
   - Меню админ-панели строится вызовом `getAdminNavigation()` из `src/core/modules.ts`, который объединяет базовые разделы ядра («Точки», «Сотрудники», «Показатели») и разделы всех зарегистрированных модулей (`module.adminNavItems`).
   - Экран `/admin/stats` вызывает `collectModulesStats(params)` из `src/core/modules.ts`, собирая карточки метрик и таблицы из всех модулей, реализовавших `getStatsBlock`.

---

## 3. Как по шагам подключить новый модуль (например, `ev` — Зарядные станции)

### Шаг 1. Создайте миграции модуля
Создайте папку `migrations/ev/001_init_ev.sql` с таблицами с префиксом `ev_` (например, `ev_connectors`, `ev_sessions`) и добавьте имя папки `'ev'` в массив `scopes` в `scripts/migrate.ts`.

### Шаг 2. Создайте папку модуля `src/modules/ev/`
Реализуйте бизнес-логику модуля и создайте файл `src/modules/ev/module.ts`, реализующий интерфейс `PlatformModule` из `@/core/types`:

```ts
import type { PlatformModule } from '@/core/types';

export const evModule: PlatformModule = {
  id: 'ev',
  title: 'Зарядка электромобилей',
  serviceCode: 'ev_charge',
  adminNavItems: [
    {
      id: 'ev-stations',
      label: 'ЭЗС и коннекторы',
      href: '/admin/ev',
      moduleId: 'ev',
      order: 25,
    },
  ],
  homeBlock: {
    moduleId: 'ev',
    title: 'Быстрая зарядка электромобилей',
    subtitle: 'Заряжайте авто на станциях в Миассе',
    href: '/ev',
  },
  async getStatsBlock(params) {
    return {
      moduleId: 'ev',
      moduleTitle: 'Зарядка электромобилей',
      metrics: [
        { id: 'ev-sessions', label: 'Зарядных сессий', value: 0 },
      ],
    };
  },
};
```

### Шаг 3. Зарегистрируйте модуль в `src/modules/index.ts`
Добавьте `registerModule(evModule)` в `src/modules/index.ts`. После этого:
- В шапке админ-панели автоматически появится пункт меню **«ЭЗС и коннекторы»**;
- На экране **«Показатели»** (`/admin/stats`) автоматически появится блок статистики нового модуля.

### Шаг 4. Добавьте маршруты Next.js и замените промо-ссылку
1. Создайте API-маршруты в `src/app/api/ev/...` и страницы в `src/app/ev/...` и `src/app/admin/ev/...`.
2. В `PROMO_SERVICE_BLOCKS` (`src/core/modules.ts`) замените внешнюю ссылку промоблока `ev-charge` на внутренний маршрут `/ev` (`isExternal: false`).
3. Привяжите сервис `'ev_charge'` к нужным точкам в таблице `point_services`.

При этом ни одна строка кода модуля `src/modules/coffee/` не затрагивается.
