import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRateLimit } from '@/core/auth/rate-limit';
import { registerClient } from '@/core/auth/service';
import { setSessionCookie } from '@/core/auth/session';
import { getClientIp, handleApiError } from '@/core/http';
import { attachGuestOrderAcrossModules } from '@/core/modules';
import '@/modules';

const schema = z.object({
  name: z.string().min(2, 'Имя должно быть от 2 до 40 символов').max(40, 'Имя должно быть от 2 до 40 символов'),
  phone: z.string().min(1, 'Введите телефон'),
  password: z.string().min(8, 'Пароль должен содержать не менее 8 символов'),
  passwordConfirm: z.string().min(1, 'Повторите пароль'),
  consent: z.boolean().refine((v) => v === true, {
    message: 'Необходимо согласие на обработку персональных данных',
  }),
  attachOrderAccessKey: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    enforceRateLimit(`client-register:${ip}`, 10, 60_000);

    const body = await req.json();
    const parsed = schema.parse(body);

    const { user, sessionId, expiresAt } = await registerClient(parsed);

    if (parsed.attachOrderAccessKey) {
      await attachGuestOrderAcrossModules(parsed.attachOrderAccessKey, user.id);
    }

    await setSessionCookie(sessionId, expiresAt);
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
