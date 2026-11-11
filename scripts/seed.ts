import path from 'node:path';
import bcrypt from 'bcryptjs';
import { closeDb, query, transaction } from '../src/core/db';
import { loadEnvIfNeeded } from '../src/core/env';
import { runMigrations } from './migrate';

loadEnvIfNeeded();

export async function runSeed(): Promise<void> {
  await runMigrations();

  const adminLogin = process.env.SEED_ADMIN_LOGIN || 'admin_stanciya';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMeAdmin123!';
  const barista1Login = process.env.SEED_BARISTA1_LOGIN || 'barista_avtozavod';
  const barista1Password = process.env.SEED_BARISTA1_PASSWORD || 'ChangeMeBarista1!';
  const barista2Login = process.env.SEED_BARISTA2_LOGIN || 'barista_mashgorodok';
  const barista2Password = process.env.SEED_BARISTA2_PASSWORD || 'ChangeMeBarista2!';

  await transaction(async (tx) => {
    // 1. Точки в г. Миасс (часы работы 08:00-21:00 ежедневно)
    const pointsData = [
      {
        name: 'СТАНЦИЯ Автозавод',
        address: 'г. Миасс, пр. Автозаводцев, 54',
        phone: '+79000112233',
      },
      {
        name: 'СТАНЦИЯ Машгородок',
        address: 'г. Миасс, пр. Макеева, 25',
        phone: '+79000112244',
      },
    ];

    const pointIds: number[] = [];

    for (const pt of pointsData) {
      const existingPt = await tx.query<{ id: number }>(
        'SELECT id FROM points WHERE name = $1',
        [pt.name]
      );
      let pointId: number;
      if (existingPt.rowCount > 0) {
        pointId = existingPt.rows[0].id;
        await tx.query(
          'UPDATE points SET address = $1, phone = $2 WHERE id = $3',
          [pt.address, pt.phone, pointId]
        );
      } else {
        const insertedPt = await tx.query<{ id: number }>(
          `INSERT INTO points (name, address, phone, prep_minutes, slot_step_minutes, accepts_orders, is_hidden)
           VALUES ($1, $2, $3, 10, 10, TRUE, FALSE)
           RETURNING id`,
          [pt.name, pt.address, pt.phone]
        );
        pointId = insertedPt.rows[0].id;
      }
      pointIds.push(pointId);

      for (let weekday = 0; weekday <= 6; weekday++) {
        await tx.query(
          `INSERT INTO point_hours (point_id, weekday, opens_at, closes_at, is_closed)
           VALUES ($1, $2, '08:00', '21:00', FALSE)
           ON CONFLICT (point_id, weekday) DO UPDATE
           SET opens_at = EXCLUDED.opens_at, closes_at = EXCLUDED.closes_at, is_closed = EXCLUDED.is_closed`,
          [pointId, weekday]
        );
      }

      await tx.query(
        `INSERT INTO point_services (point_id, service)
         VALUES ($1, 'coffee')
         ON CONFLICT (point_id, service) DO NOTHING`,
        [pointId]
      );
    }

    // 2. Сотрудники: 1 администратор и по 1 бариста на точку
    const adminHash = await bcrypt.hash(adminPassword, 10);
    const barista1Hash = await bcrypt.hash(barista1Password, 10);
    const barista2Hash = await bcrypt.hash(barista2Password, 10);

    const staffSeeds = [
      {
        name: 'Администратор СТАНЦИЯ',
        login: adminLogin,
        passwordHash: adminHash,
        role: 'admin',
        pointId: null,
      },
      {
        name: 'Бариста Автозавод',
        login: barista1Login,
        passwordHash: barista1Hash,
        role: 'barista',
        pointId: pointIds[0],
      },
      {
        name: 'Бариста Машгородок',
        login: barista2Login,
        passwordHash: barista2Hash,
        role: 'barista',
        pointId: pointIds[1],
      },
    ];

    for (const s of staffSeeds) {
      await tx.query(
        `INSERT INTO users (name, login, password_hash, role, point_id, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (login) DO UPDATE
         SET name = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role,
             point_id = EXCLUDED.point_id,
             is_active = TRUE`,
        [s.name, s.login, s.passwordHash, s.role, s.pointId]
      );
    }

    // 3. Категории: Кофе, Холодное, Другое, Еда
    const categoriesData = [
      { name: 'Кофе', sortOrder: 10 },
      { name: 'Холодное', sortOrder: 20 },
      { name: 'Другое', sortOrder: 30 },
      { name: 'Еда', sortOrder: 40 },
    ];

    const categoryMap = new Map<string, number>();
    for (const cat of categoriesData) {
      const existingCat = await tx.query<{ id: number }>(
        'SELECT id FROM coffee_categories WHERE name = $1',
        [cat.name]
      );
      if (existingCat.rowCount > 0) {
        categoryMap.set(cat.name, existingCat.rows[0].id);
        await tx.query(
          'UPDATE coffee_categories SET sort_order = $1, is_published = TRUE WHERE id = $2',
          [cat.sortOrder, existingCat.rows[0].id]
        );
      } else {
        const insCat = await tx.query<{ id: number }>(
          'INSERT INTO coffee_categories (name, sort_order, is_published) VALUES ($1, $2, TRUE) RETURNING id',
          [cat.name, cat.sortOrder]
        );
        categoryMap.set(cat.name, insCat.rows[0].id);
      }
    }

    // 4. Группы модификаторов: Объём, Молоко, Сироп
    const modGroupsData = [
      {
        name: 'Объём',
        selectType: 'single' as const,
        isRequired: true,
        options: [
          { name: '300 мл', priceDelta: 0, isDefault: true, sortOrder: 10 },
          { name: '400 мл', priceDelta: 40, isDefault: false, sortOrder: 20 },
        ],
      },
      {
        name: 'Молоко',
        selectType: 'single' as const,
        isRequired: true,
        options: [
          { name: 'Обычное', priceDelta: 0, isDefault: true, sortOrder: 10 },
          { name: 'Овсяное', priceDelta: 50, isDefault: false, sortOrder: 20 },
          { name: 'Кокосовое', priceDelta: 50, isDefault: false, sortOrder: 30 },
        ],
      },
      {
        name: 'Сироп',
        selectType: 'multiple' as const,
        isRequired: false,
        options: [
          { name: 'Ваниль', priceDelta: 30, isDefault: false, sortOrder: 10 },
          { name: 'Карамель', priceDelta: 30, isDefault: false, sortOrder: 20 },
        ],
      },
    ];

    const groupMap = new Map<string, number>();

    for (const grp of modGroupsData) {
      const existingGrp = await tx.query<{ id: number }>(
        'SELECT id FROM coffee_modifier_groups WHERE name = $1',
        [grp.name]
      );
      let groupId: number;
      if (existingGrp.rowCount > 0) {
        groupId = existingGrp.rows[0].id;
        await tx.query(
          'UPDATE coffee_modifier_groups SET select_type = $1, is_required = $2 WHERE id = $3',
          [grp.selectType, grp.isRequired, groupId]
        );
      } else {
        const insGrp = await tx.query<{ id: number }>(
          'INSERT INTO coffee_modifier_groups (name, select_type, is_required) VALUES ($1, $2, $3) RETURNING id',
          [grp.name, grp.selectType, grp.isRequired]
        );
        groupId = insGrp.rows[0].id;
      }
      groupMap.set(grp.name, groupId);

      for (const opt of grp.options) {
        const existingOpt = await tx.query<{ id: number }>(
          'SELECT id FROM coffee_modifier_options WHERE group_id = $1 AND name = $2',
          [groupId, opt.name]
        );
        if (existingOpt.rowCount > 0) {
          await tx.query(
            `UPDATE coffee_modifier_options
             SET price_delta = $1, is_default = $2, sort_order = $3, is_available = TRUE
             WHERE id = $4`,
            [opt.priceDelta, opt.isDefault, opt.sortOrder, existingOpt.rows[0].id]
          );
        } else {
          await tx.query(
            `INSERT INTO coffee_modifier_options (group_id, name, price_delta, is_available, is_default, sort_order)
             VALUES ($1, $2, $3, TRUE, $4, $5)`,
            [groupId, opt.name, opt.priceDelta, opt.isDefault, opt.sortOrder]
          );
        }
      }
    }

    // 5. Товары
    const productsData = [
      {
        name: 'Капучино',
        category: 'Кофе',
        description: 'Классический эспрессо с бархатистой молочной пеной',
        basePrice: 190,
        groups: ['Объём', 'Молоко', 'Сироп'],
      },
      {
        name: 'Латте',
        category: 'Кофе',
        description: 'Мягкий кофейный напиток с большим количеством вспененного молока',
        basePrice: 220,
        groups: ['Объём', 'Молоко', 'Сироп'],
      },
      {
        name: 'Американо',
        category: 'Кофе',
        description: 'Насыщенный чёрный кофе на основе двойного эспрессо',
        basePrice: 160,
        groups: ['Объём', 'Сироп'],
      },
      {
        name: 'Раф',
        category: 'Кофе',
        description: 'Нежный сливочно-кофейный напиток, взбитый со сливками',
        basePrice: 250,
        groups: ['Объём', 'Сироп'],
      },
      {
        name: 'Айс Латте',
        category: 'Холодное',
        description: 'Освежающий холодный латте со льдом',
        basePrice: 230,
        groups: ['Объём', 'Молоко', 'Сироп'],
      },
      {
        name: 'Эспрессо-тоник',
        category: 'Холодное',
        description: 'Бодрящий микс двойного эспрессо, тоника и льда',
        basePrice: 240,
        groups: ['Объём'],
      },
      {
        name: 'Какао',
        category: 'Другое',
        description: 'Горячий шоколадный напиток на молоке',
        basePrice: 200,
        groups: ['Объём', 'Молоко', 'Сироп'],
      },
      {
        name: 'Чай облепиховый',
        category: 'Другое',
        description: 'Согревающий чай с облепихой, имбирём и мёдом',
        basePrice: 210,
        groups: ['Объём'],
      },
      {
        name: 'Круассан',
        category: 'Еда',
        description: 'Свежий слоёный сливочный круассан с хрустящей корочкой',
        basePrice: 170,
        groups: [],
      },
      {
        name: 'Сэндвич с индейкой',
        category: 'Еда',
        description: 'Сытный сэндвич на ремесленном хлебе с индейкой и творожным сыром',
        basePrice: 260,
        groups: [],
      },
    ];

    for (const prod of productsData) {
      const catId = categoryMap.get(prod.category)!;
      const existingProd = await tx.query<{ id: number }>(
        'SELECT id FROM coffee_products WHERE name = $1 AND deleted_at IS NULL',
        [prod.name]
      );
      let productId: number;
      if (existingProd.rowCount > 0) {
        productId = existingProd.rows[0].id;
        await tx.query(
          `UPDATE coffee_products
           SET category_id = $1, description = $2, base_price = $3, is_published = TRUE, in_stock = TRUE
           WHERE id = $4`,
          [catId, prod.description, prod.basePrice, productId]
        );
      } else {
        const insProd = await tx.query<{ id: number }>(
          `INSERT INTO coffee_products (category_id, name, description, base_price, is_published, in_stock)
           VALUES ($1, $2, $3, $4, TRUE, TRUE)
           RETURNING id`,
          [catId, prod.name, prod.description, prod.basePrice]
        );
        productId = insProd.rows[0].id;
      }

      await tx.query('DELETE FROM coffee_product_modifier_groups WHERE product_id = $1', [
        productId,
      ]);
      for (let idx = 0; idx < prod.groups.length; idx++) {
        const gId = groupMap.get(prod.groups[idx]);
        if (gId) {
          await tx.query(
            `INSERT INTO coffee_product_modifier_groups (product_id, group_id, sort_order)
             VALUES ($1, $2, $3)
             ON CONFLICT (product_id, group_id) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
            [productId, gId, (idx + 1) * 10]
          );
        }
      }
    }
  });
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase().endsWith(path.join('scripts', 'seed.ts').toLowerCase());

if (isMain) {
  runSeed()
    .then(async () => {
      console.log('Сиды успешно применены.');
      await closeDb();
    })
    .catch(async (err) => {
      console.error('Ошибка при выполнении сидов:', err);
      await closeDb();
      process.exit(1);
    });
}
