import { hashPassword, verifyPassword } from '../auth/password';
import { collectClientOrderStats } from '../modules';
import type { ClientListItem } from '../types';
import { deleteAllUserSessions } from '../auth/session';
import { query, transaction } from '../db';
import { AppError } from '../errors';
import { normalizeRussianPhone, requireNormalizedPhone } from '../phone';

export interface StaffMemberDto {
  id: number;
  name: string;
  login: string | null;
  phone: string | null;
  role: string;
  pointId: number | null;
  pointName: string | null;
  isActive: boolean;
  createdAt: string;
}

export async function updateClientProfile(
  userId: number,
  input: { name: string; phone: string }
): Promise<{ id: number; name: string; phone: string }> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 40) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Имя должно быть от 2 до 40 символов', {
      name: 'Имя должно быть от 2 до 40 символов',
    });
  }

  const phone = requireNormalizedPhone(input.phone, 'phone');

  const conflict = await query<{ id: number }>(
    'SELECT id FROM users WHERE phone = $1 AND id <> $2',
    [phone, userId]
  );
  if (conflict.rowCount > 0) {
    throw new AppError(409, 'PHONE_TAKEN', 'Этот номер уже используется', {
      phone: 'Этот номер уже используется',
    });
  }

  await query('UPDATE users SET name = $1, phone = $2 WHERE id = $3', [
    name,
    phone,
    userId,
  ]);

  return { id: userId, name, phone };
}

export async function changeUserPassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (!newPassword || newPassword.length < 8) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Новый пароль должен быть не короче 8 символов', {
      newPassword: 'Новый пароль должен быть не короче 8 символов',
    });
  }

  const res = await query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );
  if (res.rowCount === 0) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }

  const valid = await verifyPassword(currentPassword, res.rows[0].password_hash);
  if (!valid) {
    throw new AppError(400, 'INVALID_PASSWORD', 'Текущий пароль указан неверно', {
      currentPassword: 'Текущий пароль указан неверно',
    });
  }

  const newHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
}

export async function listStaff(): Promise<StaffMemberDto[]> {
  const res = await query<{
    id: number;
    name: string;
    login: string | null;
    phone: string | null;
    role: string;
    point_id: number | null;
    point_name: string | null;
    is_active: boolean;
    created_at: string;
  }>(
    `SELECT u.id, u.name, u.login, u.phone, u.role, u.point_id, p.name AS point_name, u.is_active, u.created_at
     FROM users u
     LEFT JOIN points p ON p.id = u.point_id
     WHERE u.role <> 'client'
     ORDER BY u.role ASC, u.id ASC`
  );

  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    login: r.login,
    phone: r.phone,
    role: r.role,
    pointId: r.point_id,
    pointName: r.point_name,
    isActive: r.is_active,
    createdAt: r.created_at,
  }));
}

export async function listClientsForPasswordReset(search?: string): Promise<
  Array<{ id: number; name: string; phone: string | null; isActive: boolean }>
> {
  const q = search?.trim();
  if (q) {
    const res = await query<{
      id: number;
      name: string;
      phone: string | null;
      is_active: boolean;
    }>(
      `SELECT id, name, phone, is_active
       FROM users
       WHERE role = 'client' AND (name ILIKE $1 OR phone ILIKE $1)
       ORDER BY id DESC
       LIMIT 30`,
      [`%${q}%`]
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      isActive: r.is_active,
    }));
  }

  const res = await query<{
    id: number;
    name: string;
    phone: string | null;
    is_active: boolean;
  }>(
    `SELECT id, name, phone, is_active
     FROM users
     WHERE role = 'client'
     ORDER BY id DESC
     LIMIT 30`
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    isActive: r.is_active,
  }));
}

export interface CreateStaffInput {
  name: string;
  login: string;
  password: string;
  role: string;
  pointId?: number | null;
  phone?: string | null;
  isActive?: boolean;
}

export async function createStaff(input: CreateStaffInput): Promise<StaffMemberDto> {
  const name = input.name.trim();
  const login = input.login.trim();
  const fields: Record<string, string> = {};

  if (name.length < 2 || name.length > 80) {
    fields.name = 'Введите имя сотрудника (2-80 символов)';
  }
  if (login.length < 3 || login.length > 60) {
    fields.login = 'Логин должен быть от 3 до 60 символов';
  }
  if (!input.password || input.password.length < 6) {
    fields.password = 'Пароль должен быть не короче 6 символов';
  }
  if (input.role === 'barista' && !input.pointId) {
    fields.pointId = 'Для бариста необходимо выбрать точку';
  }

  if (Object.keys(fields).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', Object.values(fields)[0], fields);
  }

  const existing = await query<{ id: number }>(
    'SELECT id FROM users WHERE login = $1',
    [login]
  );
  if (existing.rowCount > 0) {
    throw new AppError(409, 'LOGIN_TAKEN', 'Такой логин уже есть', {
      login: 'Такой логин уже есть',
    });
  }

  const normalizedPhone = input.phone?.trim()
    ? normalizeRussianPhone(input.phone.trim())
    : null;

  const passwordHash = await hashPassword(input.password);
  const pointId = input.role === 'barista' ? input.pointId ?? null : input.pointId ?? null;
  const isActive = input.isActive !== undefined ? input.isActive : true;

  const inserted = await query<{ id: number }>(
    `INSERT INTO users (name, login, phone, password_hash, role, point_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [name, login, normalizedPhone, passwordHash, input.role, pointId, isActive]
  );

  const all = await listStaff();
  return all.find((s) => s.id === inserted.rows[0].id)!;
}

export interface UpdateStaffInput {
  name: string;
  login: string;
  role: string;
  pointId?: number | null;
  phone?: string | null;
  isActive: boolean;
}

export async function updateStaff(
  staffId: number,
  input: UpdateStaffInput
): Promise<StaffMemberDto> {
  const name = input.name.trim();
  const login = input.login.trim();
  const fields: Record<string, string> = {};

  if (name.length < 2 || name.length > 80) {
    fields.name = 'Введите имя сотрудника (2-80 символов)';
  }
  if (login.length < 3 || login.length > 60) {
    fields.login = 'Логин должен быть от 3 до 60 символов';
  }
  if (input.role === 'barista' && !input.pointId) {
    fields.pointId = 'Для бариста необходимо выбрать точку';
  }

  if (Object.keys(fields).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', Object.values(fields)[0], fields);
  }

  await transaction(async (tx) => {
    const currentRes = await tx.query<{
      id: number;
      role: string;
      is_active: boolean;
    }>('SELECT id, role, is_active FROM users WHERE id = $1 AND role <> $2', [
      staffId,
      'client',
    ]);

    if (currentRes.rowCount === 0) {
      throw new AppError(404, 'STAFF_NOT_FOUND', 'Сотрудник не найден');
    }

    const current = currentRes.rows[0];
    const isLosingAdmin =
      current.role === 'admin' &&
      current.is_active &&
      (input.role !== 'admin' || !input.isActive);

    if (isLosingAdmin) {
      const activeAdmins = await tx.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM users WHERE role = 'admin' AND is_active = TRUE AND id <> $1`,
        [staffId]
      );
      const otherAdminsCount = Number(activeAdmins.rows[0]?.cnt ?? 0);
      if (otherAdminsCount === 0) {
        throw new AppError(
          409,
          'LAST_ADMIN_PROTECTION',
          'Нельзя отключить или понизить единственного активного администратора'
        );
      }
    }

    const duplicate = await tx.query<{ id: number }>(
      'SELECT id FROM users WHERE login = $1 AND id <> $2',
      [login, staffId]
    );
    if (duplicate.rowCount > 0) {
      throw new AppError(409, 'LOGIN_TAKEN', 'Такой логин уже есть', {
        login: 'Такой логин уже есть',
      });
    }

    const normalizedPhone = input.phone?.trim()
      ? normalizeRussianPhone(input.phone.trim())
      : null;

    await tx.query(
      `UPDATE users
       SET name = $1, login = $2, phone = $3, role = $4, point_id = $5, is_active = $6
       WHERE id = $7`,
      [
        name,
        login,
        normalizedPhone,
        input.role,
        input.pointId ?? null,
        input.isActive,
        staffId,
      ]
    );

    if (!input.isActive || current.role !== input.role) {
      await deleteAllUserSessions(staffId);
    }
  });

  const all = await listStaff();
  return all.find((s) => s.id === staffId)!;
}

export async function adminResetUserPassword(
  targetUserId: number,
  newPassword: string
): Promise<void> {
  if (!newPassword || newPassword.length < 6) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Пароль должен быть не короче 6 символов', {
      password: 'Пароль должен быть не короче 6 символов',
    });
  }

  const existing = await query<{ id: number }>(
    'SELECT id FROM users WHERE id = $1',
    [targetUserId]
  );
  if (existing.rowCount === 0) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }

  const hash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, targetUserId]);
}

/** Зарегистрированные гости со статистикой заказов: поиск по имени и телефону, постранично. */
export async function listClientsWithStats(input: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ clients: ClientListItem[]; totalCount: number; totalPages: number }> {
  const pageSize = Math.min(Math.max(input.pageSize ?? 25, 5), 100);
  const page = Math.max(input.page ?? 1, 1);
  const q = input.search?.trim();
  const where = q ? "role = 'client' AND (name ILIKE $1 OR phone ILIKE $1)" : "role = 'client'";
  const params: unknown[] = q ? [`%${q}%`] : [];

  const countRes = await query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM users WHERE ${where}`, params);
  const totalCount = countRes.rows[0]?.c ?? 0;

  const rows = await query<{
    id: number;
    name: string;
    phone: string | null;
    is_active: boolean;
    created_at: string;
  }>(
    `SELECT id, name, phone, is_active, created_at
     FROM users
     WHERE ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params
  );

  const stats = await collectClientOrderStats(rows.rows.map((r) => r.id));
  return {
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    clients: rows.rows.map((r) => {
      const st = stats.get(r.id);
      return {
        id: r.id,
        name: r.name,
        phone: r.phone,
        isActive: r.is_active,
        registeredAt: new Date(r.created_at).toISOString(),
        ordersCount: st?.ordersCount ?? 0,
        doneCount: st?.doneCount ?? 0,
        doneSum: st?.doneSum ?? 0,
        lastOrderAt: st?.lastOrderAt ?? null,
      };
    }),
  };
}
