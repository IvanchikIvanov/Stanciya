-- Новый код выдачи задаёт приложение. Старые номера сохраняются как текст.
-- Сохраняем значение по умолчанию для прежней версии приложения на время выкладки и отката.
ALTER TABLE coffee_orders ALTER COLUMN number DROP DEFAULT;
ALTER TABLE coffee_orders ALTER COLUMN number TYPE VARCHAR(16) USING number::text;
ALTER TABLE coffee_orders ALTER COLUMN number SET DEFAULT nextval('coffee_order_number_seq')::text;
ALTER TABLE coffee_orders ADD CONSTRAINT coffee_orders_number_unique UNIQUE (number);
