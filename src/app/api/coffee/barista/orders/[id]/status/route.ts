import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import {
  type OrderStatus,
  transitionOrderStatusByStaff,
} from '@/modules/coffee/orders/service';

const schema = z.object({
  expectedFromStatus: z.enum([
    'new',
    'accepted',
    'cooking',
    'ready',
    'done',
    'cancelled',
  ]),
  toStatus: z.enum([
    'new',
    'accepted',
    'cooking',
    'ready',
    'done',
    'cancelled',
  ]),
  shiftMinutes: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15)]).optional(),
  cancelReason: z.string().optional(),
  cancelComment: z.string().optional(),
  callConfirmed: z.boolean().optional(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['barista', 'admin']);
    const { id } = await context.params;
    const body = await req.json();
    const parsed = schema.parse(body);

    const order = await transitionOrderStatusByStaff(
      {
        orderId: Number(id),
        expectedFromStatus: parsed.expectedFromStatus as OrderStatus,
        toStatus: parsed.toStatus as OrderStatus,
        shiftMinutes: parsed.shiftMinutes,
        cancelReason: parsed.cancelReason,
        cancelComment: parsed.cancelComment,
        callConfirmed: parsed.callConfirmed,
      },
      user
    );

    return NextResponse.json({ order });
  } catch (err) {
    return handleApiError(err);
  }
}
