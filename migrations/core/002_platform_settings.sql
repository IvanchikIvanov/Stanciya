-- Настройки платформы, которые администратор меняет в разделе «Настройки».
-- Ключ задаёт ядро или модуль (например, coffee.maxActiveOrdersPerPhone).
CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(120) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
