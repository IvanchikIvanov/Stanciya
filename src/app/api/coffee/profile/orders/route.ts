import { NextResponse } from 'next/server';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { listClientOrders } from '@/modules/coffee/orders/service';

export async function GET() {
  try {
    const user = await requireRole(['client']);
    const orders = await listClientOrders(user.id);
    return NextResponse.json({ orders });
  } catch (err) {
    return handleApiError(err);
  }
}
