import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/core/http';
import { verifyCartItems } from '@/modules/coffee/catalog/service';

const schema = z.object({
  items: z.array(
    z.object({
      productId: z.number().int().positive(),
      optionIds: z.array(z.number().int().positive()),
      quantity: z.number().int().min(1).max(20),
      clientUnitPrice: z.number().int().optional(),
    })
  ),
  pointId: z.number().int().positive().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body);
    const result = await verifyCartItems(parsed.items, parsed.pointId ?? null);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
