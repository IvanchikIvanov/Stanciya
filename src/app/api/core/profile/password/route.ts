import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { changeUserPassword } from '@/core/users/service';

const schema = z.object({
  currentPassword: z.string().min(1, 'Введите текущий пароль'),
  newPassword: z.string().min(8, 'Новый пароль должен быть не короче 8 символов'),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.parse(body);

    await changeUserPassword(user.id, parsed.currentPassword, parsed.newPassword);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
