import './setup-env';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { closeDb, query } from '../src/core/db';
import { runSeed } from '../scripts/seed';
import { loginClient, loginStaff, registerClient } from '../src/core/auth/service';
import { getUserBySessionId, requireRole } from '../src/core/auth/session';
import { attachGuestOrderAcrossModules, collectModulesStats } from '../src/core/modules';
import { listPublicPoints, updatePoint } from '../src/core/points/service';
import { createStaff, updateStaff } from '../src/core/users/service';
import {
  createCategory,
  createModifierGroup,
  createProduct,
  deleteCategory,
  deleteModifierGroup,
  softDeleteProduct,
  updateProduct,
} from '../src/modules/coffee/admin/service';
import { getPublicCatalog, verifyCartItems } from '../src/modules/coffee/catalog/service';
import {
  cancelOrderByGuest,
  createCoffeeOrder,
  getOrderByAccessKeyForGuest,
  getStaffOrderById,
  listAdminOrders,
  listBaristaQueue,
  listClientOrders,
  transitionOrderStatusByStaff,
} from '../src/modules/coffee/orders/service';
import '../src/modules';

const TEST_NOW = new Date('2026-11-12T08:00:00.000Z'); // 13:00 Miass time

describe('Stage 10: All 12 Acceptance Scenarios (Section 15)', () => {
  before(async () => {
    await runSeed();
    await query('DELETE FROM coffee_orders');
  });

  after(async () => {
    await query('DELETE FROM coffee_orders');
    await closeDb();
  });

  it('Scenarios 1, 2, 3: Guest places order with modifiers -> appears only on its point barista queue -> barista moves New -> Accepted -> Cooking -> Ready -> Done -> Guest sees updates', async () => {
    const { products } = await getPublicCatalog();
    const points = await listPublicPoints('coffee', TEST_NOW);
    const point1 = points[0];

    const latte = products.find((p) => p.name === 'Латте')!;
    const vol400 = latte.modifierGroups
      .find((g) => g.name === 'Объём')!
      .options.find((o) => o.name === '400 мл')!;
    const milkOat = latte.modifierGroups
      .find((g) => g.name === 'Молоко')!
      .options.find((o) => o.name === 'Овсяное')!;

    // 1. Гость без регистрации выбирает товар с модификаторами и оформляет заказ
    const guestOrder = await createCoffeeOrder(
      {
        idempotencyKey: crypto.randomUUID(),
        pointId: point1.id,
        isAsap: false,
        pickupTime: '14:00',
        customerName: 'Максим Гость',
        customerPhone: '+79123456789',
        comment: 'Погорячее',
        consent: true,
        items: [
          {
            productId: latte.id,
            optionIds: [vol400.id, milkOat.id],
            quantity: 1,
          },
        ],
      },
      null,
      TEST_NOW
    );

    assert.match(guestOrder.number, /^[A-Z0-9]{6}$/);
    assert.equal(guestOrder.status, 'new');
    assert.equal(guestOrder.total, 220 + 40 + 50);

    // 2. Заказ появляется в очереди бариста нужной точки; у бариста другой точки он не виден
    const barista1 = (
      await loginStaff(
        process.env.SEED_BARISTA1_LOGIN!,
        process.env.SEED_BARISTA1_PASSWORD!
      )
    ).user;
    const barista2 = (
      await loginStaff(
        process.env.SEED_BARISTA2_LOGIN!,
        process.env.SEED_BARISTA2_PASSWORD!
      )
    ).user;

    const q1 = await listBaristaQueue(barista1, TEST_NOW);
    const q2 = await listBaristaQueue(barista2, TEST_NOW);

    const foundInQ1 = q1.activeOrders.find(
      (o) => o.accessKey === guestOrder.accessKey
    );
    const foundInQ2 = q2.activeOrders.find(
      (o) => o.accessKey === guestOrder.accessKey
    );
    assert.ok(foundInQ1, 'Order must appear in Point 1 barista queue');
    assert.equal(foundInQ2, undefined, 'Order must NOT appear in Point 2 barista queue');

    // 3. Бариста проводит заказ от «Новый» до «Выдан»; гость видит каждое изменение
    const chain: Array<['new' | 'accepted' | 'cooking' | 'ready', 'accepted' | 'cooking' | 'ready' | 'done']> = [
      ['new', 'accepted'],
      ['accepted', 'cooking'],
      ['cooking', 'ready'],
      ['ready', 'done'],
    ];

    for (const [from, to] of chain) {
      await transitionOrderStatusByStaff(
        {
          orderId: foundInQ1.id,
          expectedFromStatus: from,
          toStatus: to,
        },
        barista1
      );
      const guestView = await getOrderByAccessKeyForGuest(guestOrder.accessKey);
      assert.equal(guestView?.status, to);
    }
  });

  it('Scenario 4 & 5: Barista cancels with reason (guest sees reason); Guest cancels in New status (blocked after Accepted)', async () => {
    const { products } = await getPublicCatalog();
    const points = await listPublicPoints('coffee', TEST_NOW);
    const point1 = points[0];
    const americano = products.find((p) => p.name === 'Американо')!;
    const vol300 = americano.modifierGroups
      .find((g) => g.name === 'Объём')!
      .options.find((o) => o.name === '300 мл')!;

    const barista1 = (
      await loginStaff(
        process.env.SEED_BARISTA1_LOGIN!,
        process.env.SEED_BARISTA1_PASSWORD!
      )
    ).user;

    // 4. Бариста отменяет заказ с причиной; гость видит отмену и причину
    const ordToCancelByBarista = await createCoffeeOrder(
      {
        idempotencyKey: crypto.randomUUID(),
        pointId: point1.id,
        isAsap: true,
        customerName: 'Ольга',
        customerPhone: '+79120000004',
        consent: true,
        items: [{ productId: americano.id, optionIds: [vol300.id], quantity: 1 }],
      },
      null,
      TEST_NOW
    );

    const q = await listBaristaQueue(barista1, TEST_NOW);
    const staffOrd = q.activeOrders.find(
      (o) => o.accessKey === ordToCancelByBarista.accessKey
    )!;

    await transitionOrderStatusByStaff(
      {
        orderId: staffOrd.id,
        expectedFromStatus: 'new',
        toStatus: 'cancelled',
        cancelReason: 'out_of_stock',
      },
      barista1
    );

    const guestViewCancelled = await getOrderByAccessKeyForGuest(
      ordToCancelByBarista.accessKey
    );
    assert.equal(guestViewCancelled?.status, 'cancelled');
    assert.equal(guestViewCancelled?.cancelReasonLabel, 'Нет позиции');

    // 5. Гость отменяет заказ в статусе «Новый»; после принятия отмена недоступна
    const ordGuestCancel = await createCoffeeOrder(
      {
        idempotencyKey: crypto.randomUUID(),
        pointId: point1.id,
        isAsap: true,
        customerName: 'Ольга',
        customerPhone: '+79120000005',
        consent: true,
        items: [{ productId: americano.id, optionIds: [vol300.id], quantity: 1 }],
      },
      null,
      TEST_NOW
    );

    const afterGuestCancel = await cancelOrderByGuest(ordGuestCancel.accessKey);
    assert.equal(afterGuestCancel.status, 'cancelled');

    const ordAccepted = await createCoffeeOrder(
      {
        idempotencyKey: crypto.randomUUID(),
        pointId: point1.id,
        isAsap: true,
        customerName: 'Ольга',
        customerPhone: '+79120000005',
        consent: true,
        items: [{ productId: americano.id, optionIds: [vol300.id], quantity: 1 }],
      },
      null,
      TEST_NOW
    );
    const qAfter = await listBaristaQueue(barista1, TEST_NOW);
    const staffAccepted = qAfter.activeOrders.find(
      (o) => o.accessKey === ordAccepted.accessKey
    )!;
    await transitionOrderStatusByStaff(
      {
        orderId: staffAccepted.id,
        expectedFromStatus: 'new',
        toStatus: 'accepted',
      },
      barista1
    );

    await assert.rejects(
      () => cancelOrderByGuest(ordAccepted.accessKey),
      (err: any) => err.status === 409
    );
  });

  it('Scenario 6: A client sees their orders and can save a guest order using its personal link', async () => {
    const clientPhone = '+79120000006';
    await query('DELETE FROM users WHERE phone = $1', [clientPhone]);

    const { products } = await getPublicCatalog();
    const croissant = products.find((p) => p.name === 'Круассан')!;
    const points = await listPublicPoints('coffee', TEST_NOW);

    // Pre-registration guest order with same phone
    const preRegOrder = await createCoffeeOrder(
      {
        idempotencyKey: crypto.randomUUID(),
        pointId: points[0].id,
        isAsap: true,
        customerName: 'Сергей до рег',
        customerPhone: clientPhone,
        consent: true,
        items: [{ productId: croissant.id, optionIds: [], quantity: 1 }],
      },
      null,
      TEST_NOW
    );
    await cancelOrderByGuest(preRegOrder.accessKey);

    const reg = await registerClient({
      name: 'Сергей Клиент',
      phone: clientPhone,
      password: 'ClientPass123',
      passwordConfirm: 'ClientPass123',
      consent: true,
    });

    const loggedIn = await loginClient(clientPhone, 'ClientPass123');
    assert.equal(loggedIn.user.name, 'Сергей Клиент');

    const clientOrder = await createCoffeeOrder(
      {
        idempotencyKey: crypto.randomUUID(),
        pointId: points[0].id,
        isAsap: true,
        customerName: loggedIn.user.name,
        customerPhone: loggedIn.user.phone!,
        consent: true,
        items: [{ productId: croissant.id, optionIds: [], quantity: 1 }],
      },
      loggedIn.user,
      TEST_NOW
    );

    const history = await listClientOrders(reg.user.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].accessKey, clientOrder.accessKey);

    await attachGuestOrderAcrossModules(preRegOrder.accessKey, reg.user.id);
    const updatedHistory = await listClientOrders(reg.user.id);
    assert.equal(updatedHistory.length, 2);
    assert.ok(updatedHistory.some((order) => order.accessKey === preRegOrder.accessKey));

    await cancelOrderByGuest(clientOrder.accessKey, reg.user.id);
    await query('DELETE FROM users WHERE id = $1', [reg.user.id]);
  });

  it('Scenarios 7, 8, 9, 10, 11, 12 + Additional checks: Admin catalog/stock/points/staff/orders/stats & limits', async () => {
    const admin = (
      await loginStaff(
        process.env.SEED_ADMIN_LOGIN!,
        process.env.SEED_ADMIN_PASSWORD!
      )
    ).user;
    const barista1 = (
      await loginStaff(
        process.env.SEED_BARISTA1_LOGIN!,
        process.env.SEED_BARISTA1_PASSWORD!
      )
    ).user;

    // 7. Админ создаёт категорию, группу модификаторов и товар с фото; товар появляется в каталоге гостя
    const newCat = await createCategory({
      name: 'Сезонное меню',
      sortOrder: 99,
      isPublished: true,
    });
    const newModGrp = await createModifierGroup({
      name: 'Подача',
      selectType: 'single',
      isRequired: true,
      options: [
        { name: 'В стакане с собой', priceDelta: 0, isAvailable: true, isDefault: true },
        { name: 'В термокружку', priceDelta: 0, isAvailable: true, isDefault: false },
      ],
    });
    const newProd = await createProduct({
      categoryId: newCat.id,
      name: 'Кедровый Раф',
      description: 'Сезонный раф с кедровыми орешками',
      imageUrl: '/api/coffee/images/test-raf.jpg',
      basePrice: 280,
      isPublished: true,
      inStock: true,
      modifierGroupIds: [newModGrp.id],
    });

    const catGuest1 = await getPublicCatalog();
    assert.ok(catGuest1.products.some((p) => p.id === newProd.id));

    // 8. Админ снимает товар с наличия; гость не может добавить его в корзину и оформить
    await updateProduct(newProd.id, {
      categoryId: newCat.id,
      name: newProd.name,
      description: newProd.description,
      imageUrl: newProd.imageUrl,
      basePrice: newProd.basePrice,
      isPublished: true,
      inStock: false,
      modifierGroupIds: [newModGrp.id],
    });

    const cartCheck = await verifyCartItems([
      {
        productId: newProd.id,
        optionIds: [newModGrp.options[0].id],
        quantity: 1,
      },
    ]);
    assert.equal(cartCheck.hasUnavailable, true);

    const points = await listPublicPoints('coffee', TEST_NOW);
    await assert.rejects(
      () =>
        createCoffeeOrder(
          {
            idempotencyKey: crypto.randomUUID(),
            pointId: points[0].id,
            isAsap: true,
            customerName: 'Тест',
            customerPhone: '+79120000008',
            consent: true,
            items: [
              {
                productId: newProd.id,
                optionIds: [newModGrp.options[0].id],
                quantity: 1,
              },
            ],
          },
          null,
          TEST_NOW
        ),
      (err: any) => err.code === 'PRODUCT_UNAVAILABLE'
    );

    // Cannot delete category while it still has products
    await assert.rejects(
      () => deleteCategory(newCat.id),
      (err: any) => err.code === 'CATEGORY_HAS_PRODUCTS'
    );

    // Clean up test product/category/modifier
    await softDeleteProduct(newProd.id);
    await deleteCategory(newCat.id);
    await deleteModifierGroup(newModGrp.id);

    // 9. Админ выключает приём заказов на точке; гость не может выбрать эту точку
    const pt2 = points[1];
    await updatePoint(pt2.id, {
      name: pt2.name,
      address: pt2.address,
      phone: pt2.phone,
      prepMinutes: pt2.prepMinutes,
      slotStepMinutes: pt2.slotStepMinutes,
      acceptsOrders: false,
      isHidden: false,
      hours: pt2.hours,
    });

    const croissant = (await getPublicCatalog()).products.find(
      (p) => p.name === 'Круассан'
    )!;
    await assert.rejects(
      () =>
        createCoffeeOrder(
          {
            idempotencyKey: crypto.randomUUID(),
            pointId: pt2.id,
            isAsap: true,
            customerName: 'Тест',
            customerPhone: '+79120000009',
            consent: true,
            items: [{ productId: croissant.id, optionIds: [], quantity: 1 }],
          },
          null,
          TEST_NOW
        ),
      (err: any) => err.code === 'POINT_CLOSED'
    );

    // Restore point 2
    await updatePoint(pt2.id, {
      name: pt2.name,
      address: pt2.address,
      phone: pt2.phone,
      prepMinutes: pt2.prepMinutes,
      slotStepMinutes: pt2.slotStepMinutes,
      acceptsOrders: true,
      isHidden: false,
      hours: pt2.hours,
    });

    // 10. Админ создаёт бариста, назначает точку, отключает его; отключённый сотрудник не может войти
    const tempLogin = `temp_barista_${Date.now()}`;
    const createdStaff = await createStaff({
      name: 'Временный Бариста',
      login: tempLogin,
      password: 'TempPassword123!',
      role: 'barista',
      pointId: points[0].id,
      isActive: true,
    });
    const tempLoginRes = await loginStaff(tempLogin, 'TempPassword123!');
    assert.equal(tempLoginRes.user.id, createdStaff.id);

    await updateStaff(createdStaff.id, {
      name: createdStaff.name,
      login: tempLogin,
      role: 'barista',
      pointId: points[0].id,
      isActive: false,
    });

    assert.equal(await getUserBySessionId(tempLoginRes.sessionId), null);
    await assert.rejects(
      () => loginStaff(tempLogin, 'TempPassword123!'),
      (err: any) => err.code === 'ACCOUNT_DISABLED'
    );
    await query('DELETE FROM users WHERE id = $1', [createdStaff.id]);

    // 11. Гость не может получить заказ по короткому номеру (только по 32+ символьному accessKey)
    assert.equal(await getOrderByAccessKeyForGuest('1001'), null);

    // 12. Админ находит заказ по номеру, видит историю статусов и показатели за период
    const orderForStats = await createCoffeeOrder(
      {
        idempotencyKey: crypto.randomUUID(),
        pointId: points[0].id,
        isAsap: true,
        customerName: 'Виктор Статистика',
        customerPhone: '+79120000012',
        consent: true,
        items: [{ productId: croissant.id, optionIds: [], quantity: 2 }],
      },
      null,
      TEST_NOW
    );

    const searchRes = await listAdminOrders(
      {
        period: 'all',
        search: String(orderForStats.number),
      },
      TEST_NOW
    );
    assert.equal(searchRes.orders.length, 1);
    const foundByAdmin = searchRes.orders[0];
    assert.equal(foundByAdmin.number, orderForStats.number);
    assert.ok((foundByAdmin.history ?? []).length >= 1);

    // Move orderForStats to done so it counts in stats revenue & popular items
    for (const [f, t] of [
      ['new', 'accepted'],
      ['accepted', 'cooking'],
      ['cooking', 'ready'],
      ['ready', 'done'],
    ] as const) {
      await transitionOrderStatusByStaff(
        {
          orderId: foundByAdmin.id,
          expectedFromStatus: f,
          toStatus: t,
        },
        barista1
      );
    }

    const statsBlocks = await collectModulesStats({ period: 'today' });
    assert.ok(statsBlocks.length >= 1);
    const coffeeStats = statsBlocks.find((b) => b.moduleId === 'coffee')!;
    assert.equal(
      coffeeStats.disclaimer,
      'Данные предзаказов, не кассовая отчётность'
    );
    assert.ok((coffeeStats.popularItems ?? []).length >= 1);
  });
});
