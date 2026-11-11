import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { updateStaff } from '@/core/users/service';

const updateStaffSchema = z.object({
  name: z.string().min(2, 'Введите имя сотрудника').max(80),
  login: z.string().min(3, 'Логин должен быть от 3 до 60 символов').max(60),
  role: z.string().min(2),
  pointId: z.number().int().nullable().optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean(),
});

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin']);
    const { id } = await context.params;
    const body = await req.json();
    const parsed = updateStaffSchema.parse(body);
    const member = await updateStaff(Number(id), parsed);
    return NextResponse.json({ staff: member });
  } catch (err) {
    return handleApiError(err);
  }
}
