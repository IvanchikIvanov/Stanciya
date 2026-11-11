import { NextResponse } from 'next/server';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { getStaffOrderById } from '@/modules/coffee/orders/service';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['admin', 'barista']);
    const { id } = await context.params;
    const order = await getStaffOrderById(Number(id), user);
    return NextResponse.json({ order });
  } catch (err) {
    return handleApiError(err);
  }
}
