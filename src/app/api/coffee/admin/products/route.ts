import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { createProduct } from '@/modules/coffee/admin/service';

const schema = z.object({
  categoryId: z.number().int().positive('Выберите категорию'),
  name: z.string().min(1, 'Укажите название товара').max(150),
  description: z.string().default(''),
  imageUrl: z.string().nullable().optional(),
  basePrice: z.number().int().min(0, 'Цена не может быть отрицательной'),
  isPublished: z.boolean().default(true),
  inStock: z.boolean().default(true),
  modifierGroupIds: z.array(z.number().int().positive()).default([]),
});

export async function POST(req: Request) {
  try {
    await requireRole(['admin']);
    const body = await req.json();
    const parsed = schema.parse(body);
    const product = await createProduct(parsed);
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
