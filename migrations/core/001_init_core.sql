CREATE TABLE IF NOT EXISTS points (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  address VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  prep_minutes INTEGER NOT NULL DEFAULT 10 CHECK (prep_minutes > 0),
  slot_step_minutes INTEGER NOT NULL DEFAULT 10 CHECK (slot_step_minutes > 0),
  accepts_orders BOOLEAN NOT NULL DEFAULT TRUE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS point_hours (
  point_id INTEGER NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  opens_at VARCHAR(5) NOT NULL DEFAULT '08:00',
  closes_at VARCHAR(5) NOT NULL DEFAULT '21:00',
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (point_id, weekday)
);

CREATE TABLE IF NOT EXISTS point_services (
  point_id INTEGER NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  service VARCHAR(50) NOT NULL,
  PRIMARY KEY (point_id, service)
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) UNIQUE,
  login VARCHAR(60) UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(32) NOT NULL,
  point_id INTEGER REFERENCES points(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(128) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  key VARCHAR(100) PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ
);
