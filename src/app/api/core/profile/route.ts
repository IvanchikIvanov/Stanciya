import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { updateClientProfile } from '@/core/users/service';

const schema = z.object({
  name: z.string().min(2, 'Имя должно быть от 2 до 40 символов').max(40, 'Имя должно быть от 2 до 40 символов'),
  phone: z.string().min(1, 'Введите телефон'),
});

export async function PATCH(req: Request) {
  try {
    const user = await requireRole(['client']);
    const body = await req.json();
    const parsed = schema.parse(body);

    const updated = await updateClientProfile(user.id, parsed);
    return NextResponse.json({ user: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
