import fs from 'node:fs';
import path from 'node:path';
import { closeDb, exec, query, transaction } from '../src/core/db';

export async function runMigrations(): Promise<string[]> {
  await exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const migrationsRoot = path.resolve(process.cwd(), 'migrations');
  const scopes = ['core', 'coffee'];
  const appliedNow: string[] = [];

  for (const scope of scopes) {
    const scopeDir = path.join(migrationsRoot, scope);
    if (!fs.existsSync(scopeDir)) continue;

    const files = fs
      .readdirSync(scopeDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const migrationName = `${scope}/${file}`;
      const existing = await query<{ name: string }>(
        'SELECT name FROM schema_migrations WHERE name = $1',
        [migrationName]
      );

      if (existing.rowCount > 0) {
        continue;
      }

      const sqlContent = fs.readFileSync(path.join(scopeDir, file), 'utf-8');
      await transaction(async (tx) => {
        await tx.exec(sqlContent);
        await tx.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [migrationName]);
      });

      appliedNow.push(migrationName);
    }
  }

  return appliedNow;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase().endsWith(path.join('scripts', 'migrate.ts').toLowerCase());

if (isMain) {
  runMigrations()
    .then(async (applied) => {
      if (applied.length === 0) {
        console.log('Миграции актуальны (новых миграций нет).');
      } else {
        console.log('Применены миграции:', applied.join(', '));
      }
      await closeDb();
    })
    .catch(async (err) => {
      console.error('Ошибка при выполнении миграций:', err);
      await closeDb();
      process.exit(1);
    });
}
