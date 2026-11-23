-- Номер заказа становится случайным буквенно-цифровым кодом (например, K7M294).
-- Такой номер непредсказуем, поэтому гость может найти заказ только по номеру,
-- без ввода телефона. Старые заказы сохраняют свои числовые номера как текст.
ALTER TABLE coffee_orders ALTER COLUMN number DROP DEFAULT;
ALTER TABLE coffee_orders ALTER COLUMN number TYPE VARCHAR(16) USING number::text;
DROP SEQUENCE IF EXISTS coffee_order_number_seq;
ALTER TABLE coffee_orders ADD CONSTRAINT coffee_orders_number_unique UNIQUE (number);
