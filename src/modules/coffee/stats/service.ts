import { query } from '@/core/db';
import { getMiassDayBounds } from '@/core/time';
import type { ModuleStatsBlockData, StatsFilterParams } from '@/core/types';

export async function getCoffeeStatsBlock(
  params: StatsFilterParams,
  now: Date = new Date()
): Promise<ModuleStatsBlockData> {
  const conditions: string[] = [];
  const sqlParams: unknown[] = [];

  if (params.pointId) {
    sqlParams.push(params.pointId);
    conditions.push(`o.point_id = $${sqlParams.length}`);
  }

  const period = params.period || 'today';
  if (period === 'today') {
    const { start, end } = getMiassDayBounds(undefined, now);
    sqlParams.push(start.toISOString(), end.toISOString());
    conditions.push(`o.created_at >= $${sqlParams.length - 1} AND o.created_at <= $${sqlParams.length}`);
  } else if (period === '7d') {
    const { end } = getMiassDayBounds(undefined, now);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    sqlParams.push(start.toISOString(), end.toISOString());
    conditions.push(`o.created_at >= $${sqlParams.length - 1} AND o.created_at <= $${sqlParams.length}`);
  } else if (period === '30d') {
    const { end } = getMiassDayBounds(undefined, now);
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    sqlParams.push(start.toISOString(), end.toISOString());
    conditions.push(`o.created_at >= $${sqlParams.length - 1} AND o.created_at <= $${sqlParams.length}`);
  } else if (period === 'custom') {
    if (params.from) {
      const { start } = getMiassDayBounds(params.from, now);
      sqlParams.push(start.toISOString());
      conditions.push(`o.created_at >= $${sqlParams.length}`);
    }
    if (params.to) {
      const { end } = getMiassDayBounds(params.to, now);
      sqlParams.push(end.toISOString());
      conditions.push(`o.created_at <= $${sqlParams.length}`);
    }
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const summaryRes = await query<{
    total_orders: string;
    done_orders: string;
    cancelled_orders: string;
    done_revenue: string;
  }>(
    `SELECT
       COUNT(*)::text AS total_orders,
       COUNT(*) FILTER (WHERE o.status = 'done')::text AS done_orders,
       COUNT(*) FILTER (WHERE o.status = 'cancelled')::text AS cancelled_orders,
       COALESCE(SUM(o.total) FILTER (WHERE o.status = 'done'), 0)::text AS done_revenue
     FROM coffee_orders o
     ${whereSql}`,
    sqlParams
  );

  const row = summaryRes.rows[0];
  const totalOrders = Number(row?.total_orders ?? 0);
  const doneOrders = Number(row?.done_orders ?? 0);
  const cancelledOrders = Number(row?.cancelled_orders ?? 0);
  const doneRevenue = Number(row?.done_revenue ?? 0);
  const avgCheck = doneOrders > 0 ? Math.round(doneRevenue / doneOrders) : 0;

  const doneWhereSql =
    conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')} AND o.status = 'done'`
      : `WHERE o.status = 'done'`;

  const topRes = await query<{
    product_name: string;
    qty: string;
    rev: string;
  }>(
    `SELECT
       oi.product_name,
       COALESCE(SUM(oi.quantity), 0)::text AS qty,
       COALESCE(SUM(oi.line_total), 0)::text AS rev
     FROM coffee_order_items oi
     JOIN coffee_orders o ON o.id = oi.order_id
     ${doneWhereSql}
     GROUP BY oi.product_name
     ORDER BY SUM(oi.quantity) DESC, SUM(oi.line_total) DESC
     LIMIT 10`,
    sqlParams
  );

  return {
    moduleId: 'coffee',
    moduleTitle: 'Кофе и маркет',
    disclaimer: 'Данные предзаказов, не кассовая отчётность',
    metrics: [
      { id: 'total-orders', label: 'Всего заказов', value: totalOrders },
      { id: 'done-orders', label: 'Выдано заказов', value: doneOrders },
      { id: 'cancelled-orders', label: 'Отменено заказов', value: cancelledOrders },
      { id: 'done-revenue', label: 'Сумма выданных', value: `${doneRevenue} ₽` },
      { id: 'avg-check', label: 'Средний чек', value: `${avgCheck} ₽` },
    ],
    popularItemsTitle: '10 популярных позиций (по выданным заказам)',
    popularItems: topRes.rows.map((r, idx) => ({
      id: idx + 1,
      name: r.product_name,
      quantity: Number(r.qty),
      revenue: Number(r.rev),
    })),
  };
}
