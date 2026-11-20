-- Стоп-лист точки: позиции, которые бариста временно снял с наличия на своей точке
-- (ответ заказчика, вопрос 3.12). Общий признак in_stock у товара остаётся у администратора.
CREATE TABLE IF NOT EXISTS coffee_point_stop_list (
  point_id INTEGER NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES coffee_products(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (point_id, product_id)
);
