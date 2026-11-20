-- Подтверждение крупного заказа звонком гостю (п. 4.4 ТЗ).
ALTER TABLE coffee_orders ADD COLUMN IF NOT EXISTS requires_call BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE coffee_orders ADD COLUMN IF NOT EXISTS call_confirmed_at TIMESTAMPTZ;
ALTER TABLE coffee_orders ADD COLUMN IF NOT EXISTS call_confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
