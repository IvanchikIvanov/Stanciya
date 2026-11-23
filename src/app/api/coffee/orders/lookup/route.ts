import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRateLimit } from '@/core/auth/rate-limit';
import { AppError } from '@/core/errors';
import { getClientIp, handleApiError } from '@/core/http';
import { findOrderAccessKeyByNumber } from '@/modules/coffee/orders/service';

const schema = z.object({
  number: z.string().min(1, 'Введите номер заказа'),
});

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    // Дополнительная защита от перебора (номер и так случайный)
    enforceRateLimit(`lookup-order:${ip}`, 10, 60_000);

    const body = await req.json();
    const parsed = schema.parse(body);

    const accessKey = await findOrderAccessKeyByNumber(parsed.number);
    if (!accessKey) {
      throw new AppError(
        404,
        'ORDER_NOT_FOUND',
        'Заказ не найден. Проверьте номер заказа — он показан на странице заказа после оформления.'
      );
    }
    return NextResponse.json({ accessKey });
  } catch (err) {
    return handleApiError(err);
  }
}
