import { NextResponse } from 'next/server';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { listAdminCatalog } from '@/modules/coffee/admin/service';

export async function GET() {
  try {
    await requireRole(['admin']);
    const data = await listAdminCatalog();
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
