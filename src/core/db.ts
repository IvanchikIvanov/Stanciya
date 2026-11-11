import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Pool, type PoolClient } from 'pg';
import { loadEnvIfNeeded } from './env';

loadEnvIfNeeded();

export interface QueryResult<T = Record<string, any>> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
}

const txStorage = new AsyncLocalStorage<DbClient>();

declare global {
  // eslint-disable-next-line no-var
  var __stanciyaPglitePromise: Promise<PGlite> | undefined;
  // eslint-disable-next-line no-var
  var __stanciyaPgPool: Pool | undefined;
}

function isPostgresUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

async function getPgliteInstance(): Promise<PGlite> {
  if (!globalThis.__stanciyaPglitePromise) {
    const dbUrl = process.env.DATABASE_URL?.trim();
    const dataDir =
      dbUrl === 'memory://'
        ? 'memory://'
        : path.resolve(process.cwd(), dbUrl || './.pglite');
    globalThis.__stanciyaPglitePromise = PGlite.create(dataDir);
  }
  return globalThis.__stanciyaPglitePromise;
}

function getPgPool(): Pool {
  if (!globalThis.__stanciyaPgPool) {
    globalThis.__stanciyaPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return globalThis.__stanciyaPgPool;
}

function normalizeResult<T>(res: { rows?: T[]; rowCount?: number | null; affectedRows?: number }): QueryResult<T> {
  const rows = (res.rows ?? []) as T[];
  const rowCount =
    typeof res.rowCount === 'number'
      ? res.rowCount
      : Math.max(typeof res.affectedRows === 'number' ? res.affectedRows : 0, rows.length);
  return { rows, rowCount };
}

export async function query<T = Record<string, any>>(
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  const activeTx = txStorage.getStore();
  if (activeTx) {
    return activeTx.query<T>(sql, params);
  }

  if (isPostgresUrl(process.env.DATABASE_URL)) {
    const pool = getPgPool();
    const res = await pool.query(sql, params);
    return normalizeResult<T>(res);
  }

  const pglite = await getPgliteInstance();
  const res = await pglite.query<T>(sql, params);
  return normalizeResult<T>(res);
}

export async function exec(sql: string): Promise<void> {
  const activeTx = txStorage.getStore();
  if (activeTx) {
    await activeTx.exec(sql);
    return;
  }

  if (isPostgresUrl(process.env.DATABASE_URL)) {
    const pool = getPgPool();
    await pool.query(sql);
    return;
  }

  const pglite = await getPgliteInstance();
  await pglite.exec(sql);
}

export async function transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
  const existingTx = txStorage.getStore();
  if (existingTx) {
    return fn(existingTx);
  }

  if (isPostgresUrl(process.env.DATABASE_URL)) {
    const pool = getPgPool();
    const client: PoolClient = await pool.connect();
    const txClient: DbClient = {
      async query<R = Record<string, any>>(sql: string, params: unknown[] = []) {
        const res = await client.query(sql, params);
        return normalizeResult<R>(res);
      },
      async exec(sql: string) {
        await client.query(sql);
      },
    };

    try {
      await client.query('BEGIN');
      const result = await txStorage.run(txClient, () => fn(txClient));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const pglite = await getPgliteInstance();
  return pglite.transaction(async (pgTx) => {
    const txClient: DbClient = {
      async query<R = Record<string, any>>(sql: string, params: unknown[] = []) {
        const res = await pgTx.query<R>(sql, params);
        return normalizeResult<R>(res);
      },
      async exec(sql: string) {
        await pgTx.exec(sql);
      },
    };
    return txStorage.run(txClient, () => fn(txClient));
  });
}

export async function closeDb(): Promise<void> {
  if (globalThis.__stanciyaPgPool) {
    await globalThis.__stanciyaPgPool.end();
    globalThis.__stanciyaPgPool = undefined;
  }
  if (globalThis.__stanciyaPglitePromise) {
    const pglite = await globalThis.__stanciyaPglitePromise;
    await pglite.close();
    globalThis.__stanciyaPglitePromise = undefined;
  }
}
