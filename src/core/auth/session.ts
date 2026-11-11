import crypto from 'node:crypto';
import { query } from '../db';
import { AppError } from '../errors';

export const SESSION_COOKIE_NAME = 'stanciya_session';
export const SESSION_TTL_DAYS = 30;

export interface SessionUser {
  id: number;
  name: string;
  phone: string | null;
  login: string | null;
  role: string;
  pointId: number | null;
  pointName: string | null;
  isActive: boolean;
}

export async function createSession(userId: number): Promise<{ sessionId: string; expiresAt: Date }> {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await query(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
    [sessionId, userId, expiresAt.toISOString()]
  );

  return { sessionId, expiresAt };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

export async function deleteAllUserSessions(userId: number): Promise<void> {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export async function setSessionCookie(sessionId: string, expiresAt: Date): Promise<void> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/',
  });
}

export async function clearSessionCookie(): Promise<void> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getUserBySessionId(sessionId: string): Promise<SessionUser | null> {
  if (!sessionId) return null;

  const res = await query<{
    id: number;
    name: string;
    phone: string | null;
    login: string | null;
    role: string;
    point_id: number | null;
    point_name: string | null;
    is_active: boolean;
  }>(
    `SELECT u.id, u.name, u.phone, u.login, u.role, u.point_id, p.name AS point_name, u.is_active
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN points p ON p.id = u.point_id
     WHERE s.id = $1 AND s.expires_at > NOW()`,
    [sessionId]
  );

  if (res.rowCount === 0) {
    return null;
  }

  const row = res.rows[0];
  if (!row.is_active) {
    await deleteSession(sessionId);
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    login: row.login,
    role: row.role,
    pointId: row.point_id,
    pointName: row.point_name,
    isActive: row.is_active,
  };
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie?.value) return null;
  return getUserBySessionId(sessionCookie.value);
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Требуется авторизация');
  }
  return user;
}

export async function requireRole(allowedRoles: string[]): Promise<SessionUser> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new AppError(403, 'FORBIDDEN', 'Нет доступа');
  }
  return user;
}
