import { query } from '../db';
import { AppError } from '../errors';
import { requireNormalizedPhone } from '../phone';
import { checkLoginLock, clearLoginAttempts, recordFailedLogin } from './login-attempts';
import { hashPassword, verifyPassword } from './password';
import { createSession, getUserBySessionId, type SessionUser } from './session';

export interface RegisterClientInput {
  name: string;
  phone: string;
  password: string;
  passwordConfirm: string;
  consent: boolean;
}

export async function registerClient(
  input: RegisterClientInput
): Promise<{ user: SessionUser; sessionId: string; expiresAt: Date }> {
  const name = input.name.trim();
  const fields: Record<string, string> = {};

  if (name.length < 2 || name.length > 40) {
    fields.name = 'Имя должно быть от 2 до 40 символов';
  }

  const phone = requireNormalizedPhone(input.phone, 'phone');

  if (!input.password || input.password.length < 8) {
    fields.password = 'Пароль должен содержать не менее 8 символов';
  }

  if (input.password !== input.passwordConfirm) {
    fields.passwordConfirm = 'Пароли не совпадают';
  }

  if (!input.consent) {
    fields.consent = 'Необходимо согласие на обработку персональных данных';
  }

  if (Object.keys(fields).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', Object.values(fields)[0], fields);
  }

  const existing = await query<{ id: number }>(
    'SELECT id FROM users WHERE phone = $1',
    [phone]
  );

  if (existing.rowCount > 0) {
    throw new AppError(
      409,
      'PHONE_ALREADY_EXISTS',
      'Этот номер уже зарегистрирован',
      { phone: 'Этот номер уже зарегистрирован' }
    );
  }

  const passwordHash = await hashPassword(input.password);
  const inserted = await query<{ id: number }>(
    `INSERT INTO users (name, phone, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'client', TRUE)
     RETURNING id`,
    [name, phone, passwordHash]
  );

  const userId = inserted.rows[0].id;
  const { sessionId, expiresAt } = await createSession(userId);
  const user = await getUserBySessionId(sessionId);

  return { user: user!, sessionId, expiresAt };
}

export async function loginClient(
  phoneRaw: string,
  password: string
): Promise<{ user: SessionUser; sessionId: string; expiresAt: Date }> {
  const phone = requireNormalizedPhone(phoneRaw, 'phone');
  await checkLoginLock(phone);

  const res = await query<{
    id: number;
    password_hash: string;
    role: string;
    is_active: boolean;
  }>(
    `SELECT id, password_hash, role, is_active
     FROM users
     WHERE phone = $1 AND role = 'client'`,
    [phone]
  );

  if (res.rowCount === 0) {
    await recordFailedLogin(phone);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Неверный телефон или пароль');
  }

  const row = res.rows[0];
  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) {
    await recordFailedLogin(phone);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Неверный телефон или пароль');
  }

  if (!row.is_active) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Доступ отключён. Обратитесь к управляющему');
  }

  await clearLoginAttempts(phone);
  const { sessionId, expiresAt } = await createSession(row.id);
  const user = await getUserBySessionId(sessionId);

  return { user: user!, sessionId, expiresAt };
}

export async function loginStaff(
  loginRaw: string,
  password: string
): Promise<{ user: SessionUser; sessionId: string; expiresAt: Date }> {
  const login = loginRaw.trim();
  if (!login || !password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Введите логин и пароль');
  }

  await checkLoginLock(login);

  const res = await query<{
    id: number;
    password_hash: string;
    role: string;
    point_id: number | null;
    is_active: boolean;
  }>(
    `SELECT id, password_hash, role, point_id, is_active
     FROM users
     WHERE login = $1 AND role <> 'client'`,
    [login]
  );

  if (res.rowCount === 0) {
    await recordFailedLogin(login);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Неверный логин или пароль');
  }

  const row = res.rows[0];
  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) {
    await recordFailedLogin(login);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Неверный логин или пароль');
  }

  if (!row.is_active) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Доступ отключён. Обратитесь к управляющему');
  }

  if (row.role === 'barista' && !row.point_id) {
    throw new AppError(403, 'BARISTA_NO_POINT', 'Вам не назначена точка');
  }

  await clearLoginAttempts(login);
  const { sessionId, expiresAt } = await createSession(row.id);
  const user = await getUserBySessionId(sessionId);

  return { user: user!, sessionId, expiresAt };
}
