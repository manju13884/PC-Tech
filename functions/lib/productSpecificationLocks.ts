export async function attachSpecificationLocks(db: D1Database, rows: unknown[]): Promise<unknown[]> {
  if (rows.length === 0) return []
  const records = rows as Record<string, unknown>[]
  const ids = JSON.stringify(records.map(record => Number(record.id)))
  const result = await db.prepare(`
    WITH requested AS (SELECT CAST(value AS INTEGER) AS id FROM json_each(?))
    SELECT specification_id,
      GROUP_CONCAT(DISTINCT sales_order_number) AS sales_orders,
      GROUP_CONCAT(DISTINCT production_plan) AS production_plans
    FROM (
      SELECT requested.id AS specification_id, line.sales_order_number,
        plan.plan_number || ' (' || plan.status || ')' AS production_plan
      FROM requested
      INNER JOIN production_plan_lines line
        ON line.customer_product_specification_id = requested.id OR line.approved_specification_revision_id = requested.id
      INNER JOIN production_plans plan ON plan.id = line.production_plan_id
      UNION ALL
      SELECT requested.id AS specification_id, line.sales_order_number,
        plan.plan_number || ' (' || plan.status || ')' AS production_plan
      FROM requested
      INNER JOIN so_line_child_specifications child ON child.product_specification_id = requested.id
      INNER JOIN production_plan_lines line
        ON line.zoho_sales_order_id = child.sales_order_id
       AND line.zoho_sales_order_line_item_id = child.sales_order_line_item_id || ':child:' || child.product_specification_id
      INNER JOIN production_plans plan ON plan.id = line.production_plan_id
    ) associations
    GROUP BY specification_id
  `).bind(ids).all<{ specification_id: number; sales_orders: string; production_plans: string }>()
  const locks = new Map((result.results ?? []).map(lock => [lock.specification_id, lock]))
  return records.map(record => ({
    ...record,
    locked_sales_orders: locks.get(Number(record.id))?.sales_orders ?? '',
    locked_production_plans: locks.get(Number(record.id))?.production_plans ?? '',
  }))
}
