import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { cancelOrderByGuest } from '@/modules/coffee/orders/service';

export async function POST(
  _req: Request,
  context: { params: Promise<{ accessKey: string }> }
) {
  try {
    const { accessKey } = await context.params;
    const user = await getCurrentUser();
    const order = await cancelOrderByGuest(
      accessKey,
      user?.role === 'client' ? user.id : null
    );
    return NextResponse.json({ order });
  } catch (err) {
    return handleApiError(err);
  }
}
