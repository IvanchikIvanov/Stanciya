import './setup-env';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { closeDb, query } from '../src/core/db';
import { runSeed } from '../scripts/seed';
import { loginStaff } from '../src/core/auth/service';
import { calculatePointAvailability, listPublicPoints } from '../src/core/points/service';
import { getPublicCatalog, verifyCartItems } from '../src/modules/coffee/catalog/service';
import { getStopListView, setProductStopped } from '../src/modules/coffee/stoplist/service';
import { getIntegerSetting, updateSettings } from '../src/core/settings/service';
import '../src/modules';
import {
  cancelOrderByGuest,
  createCoffeeOrder,
  getOrderByAccessKeyForGuest,
  getStaffOrderById,
  listBaristaQueue,
  transitionOrderStatusByStaff,
} from '../src/modules/coffee/orders/service';

// Фиксированное тестовое время: 12:03 по Миассу (Asia/Yekaterinburg, UTC+5 -> 07:03 UTC)
const TEST_NOW = new Date('2026-11-12T07:03:00.000Z');

async function orderIdByNumber(number: number): Promise<number> {
  const res = await query<{ id: number }>('SELECT id FROM coffee_orders WHERE number = $1', [number]);
  return res.rows[0].id;
}

describe('Stage 4: Coffee Business Rules (Section 5 & Section 6)', () => {
  before(async () => {
    await runSeed();
    await query('DELETE FROM coffee_orders');
  });

  after(async () => {
    await query('DELETE FROM coffee_orders');
    await closeDb();
  });

  it('5.3 calculates pickup slots, ASAP rounding, near-close and closed states in Miass time', async () => {
    const hours = Array.from({ length: 7 }, (_, wd) => ({
      weekday: wd,
      opensAt: '08:00',
      closesAt: '21:00',
      isClosed: false,
    }));

    // 12:03 Miass + 10 min prep = 12:13 -> rounded up to 10-min step = 12:20
    const midDay = calculatePointAvailability(
      {
        prepMinutes: 10,
        slotStepMinutes: 10,
        acceptsOrders: true,
        isHidden: false,
        hours,
      },
      TEST_NOW
    );
    assert.equal(midDay.isOpenNow, true);
    assert.equal(midDay.hasSlotsToday, true);
    assert.equal(midDay.asapSlot?.time, '12:20');
    assert.equal(midDay.slots[0]?.time, '12:20');
    assert.equal(midDay.slots[midDay.slots.length - 1]?.time, '21:00');

    // 20:55 Miass (15:55 UTC): 20:55 + 10 = 21:05 > 21:00 -> no slots left today
    const nearClose = calculatePointAvailability(
      {
        prepMinutes: 10,
        slotStepMinutes: 10,
        acceptsOrders: true,
        isHidden: false,
        hours,
      },
      new Date('2026-11-12T15:55:00.000Z')
    );
    assert.equal(nearClose.hasSlotsToday, false);
    assert.equal(nearClose.slots.length, 0);

    // 07:30 Miass (02:30 UTC): closed until 08:00
    const beforeOpen = calculatePointAvailability(
      {
        prepMinutes: 10,
        slotStepMinutes: 10,
        acceptsOrders: true,
        isHidden: false,
        hours,
      },
      new Date('2026-11-12T02:30:00.000Z')
    );
    assert.equal(beforeOpen.isOpenNow, false);
    assert.equal(beforeOpen.closedUntilLabel, 'Закрыто до 08:00');
  });

  it('5.2 & 5.5 validates modifiers, calculates price on server, and supports idempotency_key', async () => {
    const { products } = await getPublicCatalog();
    const points = await listPublicPoints('coffee', TEST_NOW);
    const point = points[0];

    const cappuccino = products.find((p) => p.name === 'Капучино')!;
    assert.ok(cappuccino);
    // Base price 190, default required options have +0 delta -> fromPrice = 190
    assert.equal(cappuccino.fromPrice, 190);

    const volGroup = cappuccino.modifierGroups.find((g) => g.name === 'Объём')!;
    const milkGroup = cappuccino.modifierGroups.find((g) => g.name === 'Молоко')!;
    const syrupGroup = cappuccino.modifierGroups.find((g) => g.name === 'Сироп')!;

    const opt400 = volGroup.options.find((o) => o.name === '400 мл')!; // +40
    const optOat = milkGroup.options.find((o) => o.name === 'Овсяное')!; // +50
    const optCow = milkGroup.options.find((o) => o.name === 'Обычное')!; // +0
    const optVanilla = syrupGroup.options.find((o) => o.name === 'Ваниль')!; // +30

    // Missing required group (no milk selected) -> error
    await assert.rejects(
      () =>
        createCoffeeOrder(
          {
            idempotencyKey: crypto.randomUUID(),
            pointId: point.id,
            isAsap: true,
            customerName: 'Иван',
            customerPhone: '+79001112233',
            consent: true,
            items: [{ productId: cappuccino.id, optionIds: [opt400.id], quantity: 1 }],
          },
          null,
          TEST_NOW
        ),
      (err: any) => err.code === 'REQUIRED_MODIFIER_MISSING'
    );

    // Two options in a single-select group -> error
    await assert.rejects(
      () =>
        createCoffeeOrder(
          {
            idempotencyKey: crypto.randomUUID(),
            pointId: point.id,
            isAsap: true,
            customerName: 'Иван',
            customerPhone: '+79001112233',
            consent: true,
            items: [
              {
                productId: cappuccino.id,
                optionIds: [opt400.id, optOat.id, optCow.id],
                quantity: 1,
              },
            ],
          },
          null,
          TEST_NOW
        ),
      (err: any) => err.code === 'SINGLE_MODIFIER_VIOLATION'
    );

    // Past slot -> SLOT_UNAVAILABLE
    await assert.rejects(
      () =>
        createCoffeeOrder(
          {
            idempotencyKey: crypto.randomUUID(),
            pointId: point.id,
            isAsap: false,
            pickupTime: '09:00',
            customerName: 'Иван',
            customerPhone: '+79001112233',
            consent: true,
            items: [
              {
                productId: cappuccino.id,
                optionIds: [opt400.id, optOat.id],
                quantity: 1,
              },
            ],
          },
          null,
          TEST_NOW
        ),
      (err: any) => err.code === 'SLOT_UNAVAILABLE'
    );

    // Valid order: (190 + 40 + 50 + 30) * 2 = 620 ₽
    const idemKey = crypto.randomUUID();
    const order1 = await createCoffeeOrder(
      {
        idempotencyKey: idemKey,
        pointId: point.id,
        isAsap: true,
        customerName: 'Иван Петров',
        customerPhone: '8 (900) 111-22-33',
        comment: 'Без корицы',
        consent: true,
        items: [
          {
            productId: cappuccino.id,
            optionIds: [opt400.id, optOat.id, optVanilla.id],
            quantity: 2,
          },
        ],
      },
      null,
      TEST_NOW
    );

    assert.equal(order1.total, 620);
    assert.equal(order1.items[0].unitPrice, 310);
    assert.equal(order1.items[0].lineTotal, 620);
    assert.equal(order1.customerPhone, '+79001112233');
    assert.ok(order1.accessKey.length >= 32);
    // Guest order DTO must NOT expose noShowCount
    assert.equal('noShowCount' in order1, false);

    // Duplicate submission with same idempotencyKey returns the exact same order
    const orderDup = await createCoffeeOrder(
      {
        idempotencyKey: idemKey,
        pointId: point.id,
        isAsap: true,
        customerName: 'Иван Петров',
        customerPhone: '8 (900) 111-22-33',
        consent: true,
        items: [
          {
            productId: cappuccino.id,
            optionIds: [opt400.id, optOat.id, optVanilla.id],
            quantity: 2,
          },
        ],
      },
      null,
      TEST_NOW
    );
    assert.equal(orderDup.number, order1.number);
    assert.equal(orderDup.accessKey, order1.accessKey);
  });

  it('4.4 order limit per phone: unlimited by default, configurable in settings', async () => {
    const { products } = await getPublicCatalog();
    const croissant = products.find((p) => p.name === 'Круассан')!;
    const points = await listPublicPoints('coffee', TEST_NOW);
    const point = points[0];
    const phone = '+79005556677';
    const admin = (
      await loginStaff(process.env.SEED_ADMIN_LOGIN!, process.env.SEED_ADMIN_PASSWORD!)
    ).user;

    const place = () =>
      createCoffeeOrder(
        {
          idempotencyKey: crypto.randomUUID(),
          pointId: point.id,
          isAsap: true,
          customerName: 'Анна',
          customerPhone: phone,
          consent: true,
          items: [{ productId: croissant.id, optionIds: [], quantity: 1 }],
        },
        null,
        TEST_NOW
      );

    // По умолчанию ограничения нет: три активных заказа подряд
    assert.equal(await getIntegerSetting('coffee.maxActiveOrdersPerPhone', -1), 0);
    const placed = [await place(), await place(), await place()];
    assert.ok(placed.every((o) => o.status === 'new'));

    // Администратор ставит лимит 1: следующий заказ отклоняется
    await updateSettings({ 'coffee.maxActiveOrdersPerPhone': 1 }, admin.id);
    await assert.rejects(
      () => place(),
      (err: any) =>
        err.code === 'ACTIVE_ORDERS_LIMIT' && /уже есть активный заказ/.test(err.message)
    );

    // Лимит 4: при трёх активных заказах четвёртый проходит, пятый нет
    await updateSettings({ 'coffee.maxActiveOrdersPerPhone': 4 }, admin.id);
    placed.push(await place());
    await assert.rejects(() => place(), (err: any) => err.code === 'ACTIVE_ORDERS_LIMIT');

    // Отмена освобождает место
    await cancelOrderByGuest(placed[0].accessKey);
    placed.push(await place());

    // Недопустимое значение настройки не сохраняется
    await assert.rejects(
      () => updateSettings({ 'coffee.maxActiveOrdersPerPhone': -1 }, admin.id),
      (err: any) => err.code === 'VALIDATION_ERROR'
    );
    await assert.rejects(
      () => updateSettings({ 'coffee.unknown': 1 }, admin.id),
      (err: any) => err.code === 'UNKNOWN_SETTING'
    );

    await updateSettings({ 'coffee.maxActiveOrdersPerPhone': 0 }, admin.id);
    for (const o of placed.slice(1)) await cancelOrderByGuest(o.accessKey);
  });

  it('4.4 order above the threshold requires a call before it is accepted', async () => {
    const { products } = await getPublicCatalog();
    const croissant = products.find((p) => p.name === 'Круассан')!; // 170 ₽
    const points = await listPublicPoints('coffee', TEST_NOW);
    const point = points[0];
    const admin = (
      await loginStaff(process.env.SEED_ADMIN_LOGIN!, process.env.SEED_ADMIN_PASSWORD!)
    ).user;

    const place = (quantity: number, phone: string) =>
      createCoffeeOrder(
        {
          idempotencyKey: crypto.randomUUID(),
          pointId: point.id,
          isAsap: true,
          customerName: 'Олег',
          customerPhone: phone,
          consent: true,
          items: [{ productId: croissant.id, optionIds: [], quantity }],
        },
        null,
        TEST_NOW
      );

    assert.equal(await getIntegerSetting('coffee.callConfirmThreshold', -1), 1000);

    // Ровно на пороге звонок не нужен: «выше 1000 ₽»
    const atThreshold = await createCoffeeOrder(
      {
        idempotencyKey: crypto.randomUUID(),
        pointId: point.id,
        isAsap: true,
        customerName: 'Олег',
        customerPhone: '+79001110001',
        consent: true,
        items: [{ productId: croissant.id, optionIds: [], quantity: 5 }], // 850 ₽
      },
      null,
      TEST_NOW
    );
    assert.equal(atThreshold.total, 850);
    assert.equal(atThreshold.requiresCall, false);

    const big = await place(7, '+79001110002'); // 1190 ₽
    assert.equal(big.total, 1190);
    assert.equal(big.requiresCall, true);

    const staffView = (await getStaffOrderById(await orderIdByNumber(big.number), admin))!;
    assert.equal(staffView.requiresCall, true);
    assert.equal(staffView.callConfirmedAt, null);

    // Принять без отметки о звонке нельзя
    await assert.rejects(
      () =>
        transitionOrderStatusByStaff(
          { orderId: staffView.id, expectedFromStatus: 'new', toStatus: 'accepted' },
          admin
        ),
      (err: any) => err.code === 'CALL_CONFIRMATION_REQUIRED'
    );

    // Отмена работает и без звонка
    const toCancel = await place(7, '+79001110003');
    const toCancelStaff = (await getStaffOrderById(await orderIdByNumber(toCancel.number), admin))!;
    const cancelled = await transitionOrderStatusByStaff(
      {
        orderId: toCancelStaff.id,
        expectedFromStatus: 'new',
        toStatus: 'cancelled',
        cancelReason: 'guest_request',
      },
      admin
    );
    assert.equal(cancelled.status, 'cancelled');

    // С отметкой о звонке заказ принимается и звонок фиксируется
    const accepted = await transitionOrderStatusByStaff(
      {
        orderId: staffView.id,
        expectedFromStatus: 'new',
        toStatus: 'accepted',
        callConfirmed: true,
      },
      admin
    );
    assert.equal(accepted.status, 'accepted');
    assert.ok(accepted.callConfirmedAt);

    // Дальше по цепочке звонок не требуется
    const cooking = await transitionOrderStatusByStaff(
      { orderId: staffView.id, expectedFromStatus: 'accepted', toStatus: 'cooking' },
      admin
    );
    assert.equal(cooking.status, 'cooking');

    // Порог 0 отключает звонок
    await updateSettings({ 'coffee.callConfirmThreshold': 0 }, admin.id);
    const noCall = await place(7, '+79001110004');
    assert.equal(noCall.requiresCall, false);
    await updateSettings({ 'coffee.callConfirmThreshold': 1000 }, admin.id);

    await query("UPDATE coffee_orders SET status = 'cancelled' WHERE status <> 'cancelled'");
  });

  it('3.12 barista stop-list hides a product only at their own point', async () => {
    const { products } = await getPublicCatalog();
    const croissant = products.find((p) => p.name === 'Круассан')!;
    const points = await listPublicPoints('coffee', TEST_NOW);
    const barista1 = (
      await loginStaff(process.env.SEED_BARISTA1_LOGIN!, process.env.SEED_BARISTA1_PASSWORD!)
    ).user;
    const ownPoint = points.find((p) => p.id === barista1.pointId)!;
    const otherPoint = points.find((p) => p.id !== barista1.pointId)!;

    const place = (pointId: number) =>
      createCoffeeOrder(
        {
          idempotencyKey: crypto.randomUUID(),
          pointId,
          isAsap: true,
          customerName: 'Ира',
          customerPhone: '+79002223344',
          consent: true,
          items: [{ productId: croissant.id, optionIds: [], quantity: 1 }],
        },
        null,
        TEST_NOW
      );

    const view = await setProductStopped(barista1, { productId: croissant.id, stopped: true });
    assert.equal(view.pointId, ownPoint.id);
    assert.ok(view.items.find((i) => i.productId === croissant.id)?.stopped);

    // На своей точке позицию заказать нельзя, на другой — можно
    await assert.rejects(() => place(ownPoint.id), (err: any) => err.code === 'PRODUCT_UNAVAILABLE');
    const elsewhere = await place(otherPoint.id);
    assert.equal(elsewhere.status, 'new');

    // Сверка корзины учитывает выбранную точку
    const item = [{ productId: croissant.id, optionIds: [], quantity: 1 }];
    assert.equal((await verifyCartItems(item, ownPoint.id)).hasUnavailable, true);
    assert.equal((await verifyCartItems(item, otherPoint.id)).hasUnavailable, false);

    // Бариста не управляет стоп-листом чужой точки
    await assert.rejects(
      () => setProductStopped(barista1, { productId: croissant.id, stopped: true, pointId: otherPoint.id }),
      (err: any) => err.code === 'POINT_NOT_FOUND'
    );
    await assert.rejects(
      () => getStopListView(barista1, otherPoint.id),
      (err: any) => err.code === 'POINT_NOT_FOUND'
    );

    // Возврат в наличие снова открывает заказ
    await setProductStopped(barista1, { productId: croissant.id, stopped: false });
    const back = await place(ownPoint.id);
    assert.equal(back.status, 'new');

    await query("UPDATE coffee_orders SET status = 'cancelled' WHERE status <> 'cancelled'");
  });

  it('5.1 & 5.4 & 6 enforces status chain, atomic updates, point isolation, and no_show_count', async () => {
    const { products } = await getPublicCatalog();
    const croissant = products.find((p) => p.name === 'Круассан')!;
    const points = await listPublicPoints('coffee', TEST_NOW);
    const point1 = points[0];

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
    const admin = (
      await loginStaff(
        process.env.SEED_ADMIN_LOGIN!,
        process.env.SEED_ADMIN_PASSWORD!
      )
    ).user;

    // Staff cannot place customer orders
    await assert.rejects(
      () =>
        createCoffeeOrder(
          {
            idempotencyKey: crypto.randomUUID(),
            pointId: point1.id,
            isAsap: true,
            customerName: 'Бариста',
            customerPhone: '+79009998877',
            consent: true,
            items: [{ productId: croissant.id, optionIds: [], quantity: 1 }],
          },
          barista1,
          TEST_NOW
        ),
      (err: any) => err.code === 'STAFF_CANNOT_ORDER'
    );

    const guestPhone = '+79007778899';
    const createdGuestOrder = await createCoffeeOrder(
      {
        idempotencyKey: crypto.randomUUID(),
        pointId: point1.id,
        isAsap: true,
        customerName: 'Дмитрий',
        customerPhone: guestPhone,
        consent: true,
        items: [{ productId: croissant.id, optionIds: [], quantity: 1 }],
      },
      null,
      TEST_NOW
    );

    const queue1 = await listBaristaQueue(barista1, TEST_NOW);
    const staffOrder = queue1.activeOrders.find(
      (o) => o.accessKey === createdGuestOrder.accessKey
    )!;
    assert.ok(staffOrder);

    // Barista of point 2 cannot see or mutate order of point 1 (404)
    const queue2 = await listBaristaQueue(barista2, TEST_NOW);
    assert.equal(
      queue2.activeOrders.some((o) => o.id === staffOrder.id),
      false
    );
    await assert.rejects(
      () => getStaffOrderById(staffOrder.id, barista2),
      (err: any) => err.status === 404
    );
    await assert.rejects(
      () =>
        transitionOrderStatusByStaff(
          {
            orderId: staffOrder.id,
            expectedFromStatus: 'new',
            toStatus: 'accepted',
          },
          barista2
        ),
      (err: any) => err.status === 404
    );

    // Skipping status (new -> cooking) is rejected (409)
    await assert.rejects(
      () =>
        transitionOrderStatusByStaff(
          {
            orderId: staffOrder.id,
            expectedFromStatus: 'new',
            toStatus: 'cooking',
          },
          barista1
        ),
      (err: any) => err.status === 409 && err.code === 'INVALID_STATUS_TRANSITION'
    );

    // Valid transition: new -> accepted (+10 minutes shift)
    const accepted = await transitionOrderStatusByStaff(
      {
        orderId: staffOrder.id,
        expectedFromStatus: 'new',
        toStatus: 'accepted',
        shiftMinutes: 10,
      },
      barista1
    );
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.pickupTimeAdjusted, true);

    // Guest can no longer cancel after order is accepted
    await assert.rejects(
      () => cancelOrderByGuest(createdGuestOrder.accessKey),
      (err: any) => err.status === 409 && err.code === 'ORDER_ALREADY_UPDATED'
    );

    // Stale expectedFromStatus ('new' when already 'accepted') fails with 409 ORDER_ALREADY_UPDATED
    await assert.rejects(
      () =>
        transitionOrderStatusByStaff(
          {
            orderId: staffOrder.id,
            expectedFromStatus: 'new',
            toStatus: 'accepted',
          },
          barista1
        ),
      (err: any) => err.status === 409 && err.code === 'ORDER_ALREADY_UPDATED'
    );

    // accepted -> cooking -> ready -> done
    const cooking = await transitionOrderStatusByStaff(
      {
        orderId: staffOrder.id,
        expectedFromStatus: 'accepted',
        toStatus: 'cooking',
      },
      barista1
    );
    assert.equal(cooking.status, 'cooking');

    const ready = await transitionOrderStatusByStaff(
      {
        orderId: staffOrder.id,
        expectedFromStatus: 'cooking',
        toStatus: 'ready',
      },
      barista1
    );
    assert.equal(ready.status, 'ready');

    const done = await transitionOrderStatusByStaff(
      {
        orderId: staffOrder.id,
        expectedFromStatus: 'ready',
        toStatus: 'done',
      },
      barista1
    );
    assert.equal(done.status, 'done');
    assert.equal(done.history?.length, 5); // new, accepted, cooking, ready, done

    // Now test cancellation with reason 'no_show' and noShowCount increment
    const secondOrder = await createCoffeeOrder(
      {
        idempotencyKey: crypto.randomUUID(),
        pointId: point1.id,
        isAsap: true,
        customerName: 'Дмитрий',
        customerPhone: guestPhone,
        consent: true,
        items: [{ productId: croissant.id, optionIds: [], quantity: 1 }],
      },
      null,
      TEST_NOW
    );
    const qAfter = await listBaristaQueue(barista1, TEST_NOW);
    const secondStaffOrder = qAfter.activeOrders.find(
      (o) => o.accessKey === secondOrder.accessKey
    )!;
    assert.equal(secondStaffOrder.noShowCount, 0);

    // Cancel without reason -> 400
    await assert.rejects(
      () =>
        transitionOrderStatusByStaff(
          {
            orderId: secondStaffOrder.id,
            expectedFromStatus: 'new',
            toStatus: 'cancelled',
          },
          barista1
        ),
      (err: any) => err.code === 'CANCEL_REASON_REQUIRED'
    );

    // Cancel with reason 'no_show'
    const cancelledNoShow = await transitionOrderStatusByStaff(
      {
        orderId: secondStaffOrder.id,
        expectedFromStatus: 'new',
        toStatus: 'cancelled',
        cancelReason: 'no_show',
      },
      barista1
    );
    assert.equal(cancelledNoShow.status, 'cancelled');

    const guestViewCancelled = await getOrderByAccessKeyForGuest(secondOrder.accessKey);
    assert.equal(guestViewCancelled?.status, 'cancelled');
    assert.equal(guestViewCancelled?.cancelReasonLabel, 'Гость не пришёл');

    // Next order from the same phone shows noShowCount === 1 to barista and admin
    const thirdOrder = await createCoffeeOrder(
      {
        idempotencyKey: crypto.randomUUID(),
        pointId: point1.id,
        isAsap: true,
        customerName: 'Дмитрий',
        customerPhone: guestPhone,
        consent: true,
        items: [{ productId: croissant.id, optionIds: [], quantity: 1 }],
      },
      null,
      TEST_NOW
    );

    const qThird = await listBaristaQueue(barista1, TEST_NOW);
    const thirdStaffOrder = qThird.activeOrders.find(
      (o) => o.accessKey === thirdOrder.accessKey
    )!;
    assert.equal(thirdStaffOrder.noShowCount, 1);

    // Admin can also view thirdStaffOrder with noShowCount === 1
    const adminView = await getStaffOrderById(thirdStaffOrder.id, admin);
    assert.equal(adminView?.noShowCount, 1);

    // Section 16 toggle: ENABLE_NO_SHOW_COUNTER=false hides noShowCount (returns 0)
    process.env.ENABLE_NO_SHOW_COUNTER = 'false';
    try {
      const disabledView = await getStaffOrderById(thirdStaffOrder.id, admin);
      assert.equal(disabledView?.noShowCount, 0);
    } finally {
      process.env.ENABLE_NO_SHOW_COUNTER = 'true';
    }
  });
});
