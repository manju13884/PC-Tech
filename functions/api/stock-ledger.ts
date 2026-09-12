import { getAuthenticatedUser } from '../lib/authenticatedUser'

interface Env { DB?: D1Database }
interface Context { request: Request; env: Env }
const json = (payload: unknown, status = 200) => Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })

export async function onRequestGet(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return json({ error: 'Stock Ledger database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (user.roleName !== 'SUPERADMIN') {
    const allowed = await db.prepare(`SELECT 1 FROM role_menu_permissions
      WHERE role_id=? AND menu_key='inventory-transactions' AND (can_full=1 OR can_view=1)`).bind(user.roleId).first()
    if (!allowed) return json({ error: 'Stock Ledger view access is required.' }, 403)
  }

  const url = new URL(context.request.url)
  const clauses: string[] = []
  const values: unknown[] = []
  const addLike = (key: string, column: string) => { const value = url.searchParams.get(key)?.trim(); if (value) { clauses.push(`${column} LIKE ?`); values.push(`%${value}%`) } }
  const from = url.searchParams.get('date_from')?.trim()
  const to = url.searchParams.get('date_to')?.trim()
  if (from) { clauses.push(`transaction_at >= datetime(?,'-5 hours','-30 minutes')`); values.push(from) }
  if (to) { clauses.push(`transaction_at < datetime(?,'+1 day','-5 hours','-30 minutes')`); values.push(to) }
  addLike('transaction_type', 'transaction_type')
  addLike('material', '(material_no || \' \' || item_name)')
  addLike('reel_number', 'reel_number')
  addLike('reference_number', 'reference_number')
  addLike('location', 'location_name')
  addLike('user', "(created_by || ' ' || approved_by)")

  const query = `WITH ledger_entries AS (
    SELECT l.id AS sort_id, l.transaction_at, l.transaction_type, l.reference_type, l.reference_number,
      m.material_no, m.item_name, m.reel_number, '' AS location_name,
      CASE WHEN l.movement='IN' THEN l.quantity ELSE 0 END AS in_qty,
      CASE WHEN l.movement='OUT' THEN l.quantity ELSE 0 END AS out_qty,
      l.revised_stock AS balance, l.uom,
      CASE WHEN l.reference_type IN ('JOB_TRACKING','JOB_PROCESS') THEN 'Job Consumption' ELSE l.reference_type END AS source,
      COALESCE(creator.full_name,'') AS created_by, COALESCE(approver.full_name,'') AS approved_by, l.remarks
    FROM inventory_stock_ledger l
    INNER JOIN material_inventory_records m ON m.id=l.inventory_stock_id
    LEFT JOIN users creator ON creator.id=l.created_by_user_id
    LEFT JOIN users approver ON approver.id=l.approved_by_user_id
  ), receipts AS (
    SELECT -m.id AS sort_id, m.created_at AS transaction_at, 'Material Receipt' AS transaction_type,
      'MATERIAL_INVENTORY' AS reference_type, m.material_no AS reference_number, m.material_no, m.item_name,
      m.reel_number, '' AS location_name,
      m.reel_weight_kg-COALESCE(SUM(CASE WHEN l.movement='IN' THEN l.quantity ELSE -l.quantity END),0) AS in_qty,
      0 AS out_qty,
      m.reel_weight_kg-COALESCE(SUM(CASE WHEN l.movement='IN' THEN l.quantity ELSE -l.quantity END),0) AS balance,
      'KG' AS uom, 'Material Receipt' AS source, COALESCE(creator.full_name,'') AS created_by,
      COALESCE(creator.full_name,'') AS approved_by, 'Material received into Inventory' AS remarks
    FROM material_inventory_records m
    LEFT JOIN inventory_stock_ledger l ON l.inventory_stock_id=m.id
    LEFT JOIN users creator ON creator.id=m.created_by_user_id
    GROUP BY m.id
  ), movements AS (SELECT * FROM receipts UNION ALL SELECT * FROM ledger_entries)
  SELECT * FROM movements ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
  ORDER BY transaction_at DESC, sort_id DESC LIMIT 1000`
  const result = await db.prepare(query).bind(...values).all()
  return json({ transactions: result.results ?? [] })
}
