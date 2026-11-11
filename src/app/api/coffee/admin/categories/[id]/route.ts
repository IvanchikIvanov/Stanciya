import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { deleteCategory, updateCategory } from '@/modules/coffee/admin/service';

const schema = z.object({
  name: z.string().min(1, 'Укажите название категории').max(120),
  sortOrder: z.number().int(),
  isPublished: z.boolean(),
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
    const category = await updateCategory(Number(id), parsed);
    return NextResponse.json({ category });
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
    await deleteCategory(Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
