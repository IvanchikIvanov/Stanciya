import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRateLimit } from '@/core/auth/rate-limit';
import { getCurrentUser } from '@/core/auth/session';
import { getClientIp, handleApiError } from '@/core/http';
import { createCoffeeOrder } from '@/modules/coffee/orders/service';

const schema = z.object({
  idempotencyKey: z.string().min(8, 'Отсутствует ключ идемпотентности'),
  pointId: z.number().int().positive('Выберите точку самовывоза'),
  isAsap: z.boolean(),
  pickupTime: z.string().optional(),
  customerName: z
    .string()
    .min(2, 'Имя должно быть от 2 до 40 символов')
    .max(40, 'Имя должно быть от 2 до 40 символов'),
  customerPhone: z.string().min(1, 'Введите телефон'),
  comment: z.string().max(200, 'Комментарий не должен превышать 200 символов').optional(),
  // Согласие больше не требуется отдельным флажком: гость соглашается с правилами
  // и политикой конфиденциальности самим фактом оформления заказа (фраза со ссылками на /checkout)
  consent: z.boolean().optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        optionIds: z.array(z.number().int().positive()),
        quantity: z.number().int().min(1).max(20),
      })
    )
    .min(1, 'Корзина пуста'),
});

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    enforceRateLimit(`create-order:${ip}`, 15, 60_000);

    const user = await getCurrentUser();
    const body = await req.json();
    const parsed = schema.parse(body);

    const order = await createCoffeeOrder(parsed, user);
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
