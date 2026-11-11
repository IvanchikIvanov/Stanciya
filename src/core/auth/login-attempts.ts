import { query } from '../db';
import { AppError } from '../errors';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

export async function checkLoginLock(key: string): Promise<void> {
  const res = await query<{ failed_count: number; locked_until: string | null }>(
    'SELECT failed_count, locked_until FROM login_attempts WHERE key = $1',
    [key]
  );

  if (res.rowCount === 0) return;

  const row = res.rows[0];
  if (row.locked_until) {
    const lockedUntil = new Date(row.locked_until);
    if (lockedUntil.getTime() > Date.now()) {
      const minutesLeft = Math.max(
        1,
        Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000)
      );
      throw new AppError(
        429,
        'LOGIN_LOCKED',
        `Вход временно заблокирован после 5 неудачных попыток. Повторите через ${minutesLeft} мин.`
      );
    }
    // Блокировка истекла — сбрасываем счётчик
    await clearLoginAttempts(key);
  }
}

export async function recordFailedLogin(key: string): Promise<void> {
  const res = await query<{ failed_count: number }>(
    `INSERT INTO login_attempts (key, failed_count, locked_until)
     VALUES ($1, 1, NULL)
     ON CONFLICT (key) DO UPDATE
     SET failed_count = login_attempts.failed_count + 1
     RETURNING failed_count`,
    [key]
  );

  const count = res.rows[0]?.failed_count ?? 1;
  if (count >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60_000).toISOString();
    await query(
      'UPDATE login_attempts SET locked_until = $1 WHERE key = $2',
      [lockedUntil, key]
    );
  }
}

export async function clearLoginAttempts(key: string): Promise<void> {
  await query('DELETE FROM login_attempts WHERE key = $1', [key]);
}
