import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRateLimit } from '@/core/auth/rate-limit';
import { loginClient } from '@/core/auth/service';
import { setSessionCookie } from '@/core/auth/session';
import { getClientIp, handleApiError } from '@/core/http';

const schema = z.object({
  phone: z.string().min(1, 'Введите телефон'),
  password: z.string().min(1, 'Введите пароль'),
});

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    enforceRateLimit(`client-login:${ip}`, 20, 60_000);

    const body = await req.json();
    const parsed = schema.parse(body);

    const { user, sessionId, expiresAt } = await loginClient(parsed.phone, parsed.password);
    await setSessionCookie(sessionId, expiresAt);

    return NextResponse.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}
