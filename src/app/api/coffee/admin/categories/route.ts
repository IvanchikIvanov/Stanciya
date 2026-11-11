import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { createCategory } from '@/modules/coffee/admin/service';

const schema = z.object({
  name: z.string().min(1, 'Укажите название категории').max(120),
  sortOrder: z.number().int().default(0),
  isPublished: z.boolean().default(true),
});

export async function POST(req: Request) {
  try {
    await requireRole(['admin']);
    const body = await req.json();
    const parsed = schema.parse(body);
    const category = await createCategory(parsed);
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
