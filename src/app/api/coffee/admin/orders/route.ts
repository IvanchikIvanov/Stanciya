import { NextResponse } from 'next/server';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { listAdminOrders } from '@/modules/coffee/orders/service';

export async function GET(req: Request) {
  try {
    await requireRole(['admin']);
    const { searchParams } = new URL(req.url);
    const pointId = searchParams.get('pointId')
      ? Number(searchParams.get('pointId'))
      : null;
    const status = searchParams.get('status') || 'all';
    const period =
      (searchParams.get('period') as 'today' | '7d' | '30d' | 'all' | 'custom') ||
      'today';
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    const search = searchParams.get('search') || undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : 1;
    const pageSize = searchParams.get('pageSize')
      ? Number(searchParams.get('pageSize'))
      : 20;

    const data = await listAdminOrders({
      pointId,
      status,
      period,
      from,
      to,
      search,
      page,
      pageSize,
    });
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
