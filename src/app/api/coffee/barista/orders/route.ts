import { NextResponse } from 'next/server';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { listBaristaQueue } from '@/modules/coffee/orders/service';

export async function GET() {
  try {
    const user = await requireRole(['barista', 'admin']);
    const data = await listBaristaQueue(user);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
