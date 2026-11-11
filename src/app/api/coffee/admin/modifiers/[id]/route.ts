import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import {
  deleteModifierGroup,
  updateModifierGroup,
} from '@/modules/coffee/admin/service';

const optionSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1, 'Укажите название варианта'),
  priceDelta: z.number().int().min(0, 'Доплата должна быть >= 0'),
  isAvailable: z.boolean(),
  isDefault: z.boolean(),
  sortOrder: z.number().int().optional(),
});

const groupSchema = z.object({
  name: z.string().min(1, 'Укажите название группы'),
  selectType: z.enum(['single', 'multiple']),
  isRequired: z.boolean(),
  options: z.array(optionSchema).min(1, 'Добавьте хотя бы один вариант'),
});

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin']);
    const { id } = await context.params;
    const body = await req.json();
    const parsed = groupSchema.parse(body);
    const group = await updateModifierGroup(Number(id), parsed);
    return NextResponse.json({ group });
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
    await deleteModifierGroup(Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
