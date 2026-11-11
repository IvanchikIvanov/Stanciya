import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import {
  createStaff,
  listClientsForPasswordReset,
  listStaff,
} from '@/core/users/service';

const createStaffSchema = z.object({
  name: z.string().min(2, 'Введите имя сотрудника').max(80),
  login: z.string().min(3, 'Логин должен быть от 3 до 60 символов').max(60),
  password: z.string().min(6, 'Пароль должен быть не короче 6 символов'),
  role: z.string().min(2),
  pointId: z.number().int().nullable().optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: Request) {
  try {
    await requireRole(['admin']);
    const { searchParams } = new URL(req.url);
    const clientSearch = searchParams.get('clientSearch') || undefined;
    const [staff, clients] = await Promise.all([
      listStaff(),
      listClientsForPasswordReset(clientSearch),
    ]);
    return NextResponse.json({ staff, clients });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole(['admin']);
    const body = await req.json();
    const parsed = createStaffSchema.parse(body);
    const member = await createStaff(parsed);
    return NextResponse.json({ staff: member }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
