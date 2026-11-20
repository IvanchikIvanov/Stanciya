import './setup-env';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { loginStaff, loginClient, registerClient } from '../src/core/auth/service';
import { getUserBySessionId } from '../src/core/auth/session';
import { checkLoginLock, clearLoginAttempts } from '../src/core/auth/login-attempts';
import { updateStaff, createStaff } from '../src/core/users/service';
import { closeDb, query } from '../src/core/db';
import { runSeed } from '../scripts/seed';

describe('Stage 3: Core Auth, Sessions, Roles & Lockout', () => {
  after(async () => {
    await closeDb();
  });

  it('logs in seeded admin and barista, verifies roles and point assignment', async () => {
    await runSeed();

    const adminRes = await loginStaff(
      process.env.SEED_ADMIN_LOGIN!,
      process.env.SEED_ADMIN_PASSWORD!
    );
    assert.equal(adminRes.user.role, 'admin');

    const sessionAdmin = await getUserBySessionId(adminRes.sessionId);
    assert.equal(sessionAdmin?.role, 'admin');

    const baristaRes = await loginStaff(
      process.env.SEED_BARISTA1_LOGIN!,
      process.env.SEED_BARISTA1_PASSWORD!
    );
    assert.equal(baristaRes.user.role, 'barista');
    assert.ok(baristaRes.user.pointId, 'Barista must have pointId');
  });

  it('locks login for 15 minutes after 5 consecutive failed attempts', async () => {
    const testKey = 'lockout_check_user';
    await clearLoginAttempts(testKey);

    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        () => loginStaff(testKey, 'wrong_password'),
        (err: any) => err.code === 'INVALID_CREDENTIALS'
      );
    }

    await assert.rejects(
      () => checkLoginLock(testKey),
      (err: any) => err.code === 'LOGIN_LOCKED'
    );

    await clearLoginAttempts(testKey);
  });

  it('revokes access immediately when staff member is deactivated and protects sole admin', async () => {
    const adminRes = await loginStaff(
      process.env.SEED_ADMIN_LOGIN!,
      process.env.SEED_ADMIN_PASSWORD!
    );

    // Cannot deactivate or demote sole active admin
    await assert.rejects(
      () =>
        updateStaff(adminRes.user.id, {
          name: adminRes.user.name,
          login: adminRes.user.login!,
          role: 'admin',
          isActive: false,
        }),
      (err: any) => err.code === 'LAST_ADMIN_PROTECTION'
    );

    // Deactivating a barista revokes their active session immediately
    const baristaRes = await loginStaff(
      process.env.SEED_BARISTA1_LOGIN!,
      process.env.SEED_BARISTA1_PASSWORD!
    );
    await updateStaff(baristaRes.user.id, {
      name: baristaRes.user.name,
      login: baristaRes.user.login!,
      role: 'barista',
      pointId: baristaRes.user.pointId,
      isActive: false,
    });

    const sessionAfterDisable = await getUserBySessionId(baristaRes.sessionId);
    assert.equal(sessionAfterDisable, null);

    await assert.rejects(
      () =>
        loginStaff(
          process.env.SEED_BARISTA1_LOGIN!,
          process.env.SEED_BARISTA1_PASSWORD!
        ),
      (err: any) => err.code === 'ACCOUNT_DISABLED'
    );

    // Restore barista active state
    await updateStaff(baristaRes.user.id, {
      name: baristaRes.user.name,
      login: baristaRes.user.login!,
      role: 'barista',
      pointId: baristaRes.user.pointId,
      isActive: true,
    });
  });

  it('registers and logs in a client by phone', async () => {
    const testPhone = '+79990001122';
    await query('DELETE FROM users WHERE phone = $1', [testPhone]);

    const reg = await registerClient({
      name: 'Тестовый Клиент',
      phone: '8 (999) 000-11-22',
      password: 'Password123',
      passwordConfirm: 'Password123',
      consent: true,
    });
    assert.equal(reg.user.role, 'client');
    assert.equal(reg.user.phone, testPhone);

    const login = await loginClient('+7 999 000 11 22', 'Password123');
    assert.equal(login.user.id, reg.user.id);

    await query('DELETE FROM users WHERE phone = $1', [testPhone]);
  });
});
