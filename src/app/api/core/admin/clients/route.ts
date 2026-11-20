import { NextResponse } from 'next/server';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { listClientsWithStats } from '@/core/users/service';
import '@/modules';

export async function GET(req: Request) {
  try {
    await requireRole(['admin']);
    const sp = new URL(req.url).searchParams;
    const page = Number(sp.get('page') || '1');
    const result = await listClientsWithStats({
      search: sp.get('search') ?? undefined,
      page: Number.isInteger(page) && page > 0 ? page : 1,
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
