import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  clearSessionCookie,
  deleteSession,
  SESSION_COOKIE_NAME,
} from '@/core/auth/session';
import { handleApiError } from '@/core/http';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (sessionId) {
      await deleteSession(sessionId);
    }
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
