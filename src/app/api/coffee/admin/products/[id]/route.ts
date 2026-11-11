import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import {
  softDeleteProduct,
  updateProduct,
} from '@/modules/coffee/admin/service';

const schema = z.object({
  categoryId: z.number().int().positive('Выберите категорию'),
  name: z.string().min(1, 'Укажите название товара').max(150),
  description: z.string().default(''),
  imageUrl: z.string().nullable().optional(),
  basePrice: z.number().int().min(0, 'Цена не может быть отрицательной'),
  isPublished: z.boolean(),
  inStock: z.boolean(),
  modifierGroupIds: z.array(z.number().int().positive()).default([]),
});

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin']);
    const { id } = await context.params;
    const body = await req.json();
    const parsed = schema.parse(body);
    const product = await updateProduct(Number(id), parsed);
    return NextResponse.json({ product });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin']);
    const { id } = await context.params;
    await softDeleteProduct(Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
