import { NextResponse } from 'next/server';
import { AppError } from '@/core/errors';
import { handleApiError } from '@/core/http';
import { getOrderByAccessKeyForGuest } from '@/modules/coffee/orders/service';

export async function GET(
  _req: Request,
  context: { params: Promise<{ accessKey: string }> }
) {
  try {
    const { accessKey } = await context.params;
    const order = await getOrderByAccessKeyForGuest(accessKey);
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
    }
    return NextResponse.json({ order }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
