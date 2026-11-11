import fs from 'node:fs';
import path from 'node:path';

let envLoaded = false;

export function loadEnvIfNeeded(): void {
  if (envLoaded) return;
  envLoaded = true;

  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let value = line.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore read errors if .env is inaccessible
  }
}

loadEnvIfNeeded();

export function getConfig() {
  loadEnvIfNeeded();
  const maxActiveRaw = process.env.MAX_ACTIVE_ORDERS_PER_PHONE;
  const maxActiveOrdersPerPhone =
    maxActiveRaw !== undefined && maxActiveRaw !== ''
      ? Number(maxActiveRaw)
      : 2;

  const enableNoShowRaw = process.env.ENABLE_NO_SHOW_COUNTER;
  const enableNoShowCounter =
    enableNoShowRaw === undefined || enableNoShowRaw === ''
      ? true
      : enableNoShowRaw.toLowerCase() !== 'false' && enableNoShowRaw !== '0';

  return {
    databaseUrl: process.env.DATABASE_URL ?? '',
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    maxActiveOrdersPerPhone: Number.isNaN(maxActiveOrdersPerPhone) ? 2 : maxActiveOrdersPerPhone,
    enableNoShowCounter,
  };
}
