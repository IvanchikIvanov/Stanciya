import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { getStopListView, setProductStopped } from '@/modules/coffee/stoplist/service';

function pointIdFrom(req: Request): number | null {
  const raw = new URL(req.url).searchParams.get('pointId');
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: Request) {
  try {
    const user = await requireRole(['barista', 'admin']);
    return NextResponse.json(await getStopListView(user, pointIdFrom(req)));
  } catch (err) {
    return handleApiError(err);
  }
}

const schema = z.object({
  productId: z.number().int().positive(),
  stopped: z.boolean(),
  pointId: z.number().int().positive().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireRole(['barista', 'admin']);
    const parsed = schema.parse(await req.json());
    return NextResponse.json(await setProductStopped(user, parsed));
  } catch (err) {
    return handleApiError(err);
  }
}
