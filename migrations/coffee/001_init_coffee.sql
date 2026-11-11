CREATE TABLE IF NOT EXISTS coffee_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS coffee_products (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES coffee_categories(id) ON DELETE RESTRICT,
  name VARCHAR(150) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  base_price INTEGER NOT NULL CHECK (base_price >= 0),
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  in_stock BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coffee_products_category ON coffee_products(category_id);

CREATE TABLE IF NOT EXISTS coffee_modifier_groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  select_type VARCHAR(16) NOT NULL CHECK (select_type IN ('single', 'multiple')),
  is_required BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS coffee_modifier_options (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES coffee_modifier_groups(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  price_delta INTEGER NOT NULL DEFAULT 0 CHECK (price_delta >= 0),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_coffee_mod_options_group ON coffee_modifier_options(group_id);

CREATE TABLE IF NOT EXISTS coffee_product_modifier_groups (
  product_id INTEGER NOT NULL REFERENCES coffee_products(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES coffee_modifier_groups(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, group_id)
);

CREATE SEQUENCE IF NOT EXISTS coffee_order_number_seq START WITH 1001;

CREATE TABLE IF NOT EXISTS coffee_orders (
  id SERIAL PRIMARY KEY,
  number INTEGER NOT NULL DEFAULT nextval('coffee_order_number_seq'),
  access_key VARCHAR(128) NOT NULL UNIQUE,
  idempotency_key VARCHAR(128) UNIQUE,
  point_id INTEGER NOT NULL REFERENCES points(id) ON DELETE RESTRICT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name VARCHAR(80) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  comment VARCHAR(250) NOT NULL DEFAULT '',
  pickup_at TIMESTAMPTZ NOT NULL,
  is_asap BOOLEAN NOT NULL DEFAULT FALSE,
  pickup_time_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
  total INTEGER NOT NULL CHECK (total >= 0),
  status VARCHAR(32) NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coffee_orders_point_status ON coffee_orders(point_id, status);
CREATE INDEX IF NOT EXISTS idx_coffee_orders_phone ON coffee_orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_coffee_orders_user ON coffee_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_coffee_orders_created_at ON coffee_orders(created_at);

CREATE TABLE IF NOT EXISTS coffee_order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES coffee_orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES coffee_products(id) ON DELETE SET NULL,
  product_name VARCHAR(150) NOT NULL,
  unit_price INTEGER NOT NULL,
  modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 20),
  line_total INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_coffee_order_items_order ON coffee_order_items(order_id);

CREATE TABLE IF NOT EXISTS coffee_order_status_history (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES coffee_orders(id) ON DELETE CASCADE,
  from_status VARCHAR(32),
  to_status VARCHAR(32) NOT NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(32) NOT NULL,
  cancel_reason VARCHAR(64),
  cancel_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coffee_order_history_order ON coffee_order_status_history(order_id);
