import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { adminResetUserPassword } from '@/core/users/service';

const schema = z.object({
  password: z.string().min(6, 'Пароль должен быть не короче 6 символов'),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin']);
    const { id } = await context.params;
    const body = await req.json();
    const parsed = schema.parse(body);
    await adminResetUserPassword(Number(id), parsed.password);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
