import type { SessionUser } from '@/core/auth/session';
import { query } from '@/core/db';
import { AppError } from '@/core/errors';

/**
 * Стоп-лист точки (ответ заказчика 3.12): бариста временно снимает позицию
 * с наличия только на своей точке. Общий признак «в наличии» у товара
 * по-прежнему меняет администратор в каталоге.
 */

export interface StopListItemDto {
  productId: number;
  productName: string;
  categoryName: string;
  /** Позиция снята с наличия администратором для всей сети */
  globallyOutOfStock: boolean;
  /** Позиция в стоп-листе этой точки */
  stopped: boolean;
}

export interface StopListViewDto {
  pointId: number;
  pointName: string;
  items: StopListItemDto[];
}

/** Стоп-листы всех точек: pointId → id товаров. Для витрины и сверки корзины. */
export async function getAllStopLists(): Promise<Record<number, number[]>> {
  const res = await query<{ point_id: number; product_id: number }>(
    'SELECT point_id, product_id FROM coffee_point_stop_list ORDER BY point_id, product_id'
  );
  const map: Record<number, number[]> = {};
  for (const r of res.rows) {
    (map[r.point_id] ??= []).push(r.product_id);
  }
  return map;
}

export async function getStoppedProductIds(pointId: number): Promise<Set<number>> {
  const res = await query<{ product_id: number }>(
    'SELECT product_id FROM coffee_point_stop_list WHERE point_id = $1',
    [pointId]
  );
  return new Set(res.rows.map((r) => r.product_id));
}

/** Бариста работает только со своей точкой, администратор — с любой (pointId обязателен). */
async function resolvePointForActor(
  actor: SessionUser,
  requestedPointId?: number | null
): Promise<{ id: number; name: string }> {
  if (actor.role !== 'barista' && actor.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Нет доступа');
  }

  let pointId: number | null | undefined = requestedPointId;
  if (actor.role === 'barista') {
    if (!actor.pointId) {
      throw new AppError(403, 'NO_POINT_ASSIGNED', 'Вам не назначена точка');
    }
    if (requestedPointId && requestedPointId !== actor.pointId) {
      throw new AppError(404, 'POINT_NOT_FOUND', 'Точка не найдена');
    }
    pointId = actor.pointId;
  }

  if (!pointId) {
    const first = await query<{ id: number; name: string }>(
      'SELECT id, name FROM points ORDER BY id ASC LIMIT 1'
    );
    if (first.rowCount === 0) throw new AppError(404, 'POINT_NOT_FOUND', 'Точка не найдена');
    return first.rows[0];
  }

  const res = await query<{ id: number; name: string }>('SELECT id, name FROM points WHERE id = $1', [
    pointId,
  ]);
  if (res.rowCount === 0) throw new AppError(404, 'POINT_NOT_FOUND', 'Точка не найдена');
  return res.rows[0];
}

export async function getStopListView(
  actor: SessionUser,
  requestedPointId?: number | null
): Promise<StopListViewDto> {
  const point = await resolvePointForActor(actor, requestedPointId);
  const res = await query<{
    id: number;
    name: string;
    category_name: string;
    in_stock: boolean;
    stopped: boolean;
  }>(
    `SELECT p.id, p.name, c.name AS category_name, p.in_stock,
            (s.product_id IS NOT NULL) AS stopped
     FROM coffee_products p
     JOIN coffee_categories c ON c.id = p.category_id
     LEFT JOIN coffee_point_stop_list s ON s.product_id = p.id AND s.point_id = $1
     WHERE p.deleted_at IS NULL AND p.is_published = TRUE AND c.is_published = TRUE
     ORDER BY c.sort_order ASC, c.id ASC, p.name ASC`,
    [point.id]
  );

  return {
    pointId: point.id,
    pointName: point.name,
    items: res.rows.map((r) => ({
      productId: r.id,
      productName: r.name,
      categoryName: r.category_name,
      globallyOutOfStock: !r.in_stock,
      stopped: Boolean(r.stopped),
    })),
  };
}

export async function setProductStopped(
  actor: SessionUser,
  input: { productId: number; stopped: boolean; pointId?: number | null }
): Promise<StopListViewDto> {
  const point = await resolvePointForActor(actor, input.pointId);

  const prod = await query<{ id: number }>(
    'SELECT id FROM coffee_products WHERE id = $1 AND deleted_at IS NULL',
    [input.productId]
  );
  if (prod.rowCount === 0) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Позиция не найдена');

  if (input.stopped) {
    await query(
      `INSERT INTO coffee_point_stop_list (point_id, product_id, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (point_id, product_id) DO NOTHING`,
      [point.id, input.productId, actor.id]
    );
  } else {
    await query('DELETE FROM coffee_point_stop_list WHERE point_id = $1 AND product_id = $2', [
      point.id,
      input.productId,
    ]);
  }

  return getStopListView(actor, point.id);
}
