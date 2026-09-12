import { getAuthenticatedUser } from '../lib/authenticatedUser'

interface Env { DB?: D1Database }
interface Context { request: Request; env: Env }
const json = (payload: unknown, status = 200) => Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })

async function canView(db: D1Database, roleId: number, roleName: string) {
  if (roleName === 'SUPERADMIN') return true
  const permission = await db.prepare(
    `SELECT 1 AS allowed FROM role_menu_permissions
     WHERE role_id = ? AND menu_key IN ('stock-report','material-stock') AND (can_full = 1 OR can_view = 1) LIMIT 1`,
  ).bind(roleId).first()
  return Boolean(permission)
}

export async function onRequestGet(context: Context): Promise<Response> {
  if (!context.env.DB) return json({ error: 'Stock Report database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, context.env.DB)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (!await canView(context.env.DB, user.roleId, user.roleName)) return json({ error: 'Stock Report view access is required.' }, 403)
  const url = new URL(context.request.url)
  const asOnDate = url.searchParams.get('as_on_date')?.trim() || new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOnDate)) return json({ error: 'As On Date is invalid.' }, 400)

  const stockId = Number(url.searchParams.get('inventory_stock_id'))
  if (url.searchParams.get('transactions') === '1') {
    if (!Number.isInteger(stockId) || stockId <= 0) return json({ error: 'Inventory stock record is required.' }, 400)
    const initial = await context.env.DB.prepare(
      `SELECT m.id, m.material_no, m.created_at,
        m.reel_weight_kg - COALESCE(SUM(CASE WHEN l.movement='IN' THEN l.quantity ELSE -l.quantity END),0) AS initial_quantity
       FROM material_inventory_records m LEFT JOIN inventory_stock_ledger l ON l.inventory_stock_id=m.id
       WHERE m.id=? GROUP BY m.id`,
    ).bind(stockId).first<Record<string, unknown>>()
    if (!initial) return json({ error: 'Material stock record was not found.' }, 404)
    const ledger = await context.env.DB.prepare(
      `SELECT l.transaction_at AS transaction_date,
        CASE WHEN l.transaction_type='PRODUCTION_CONSUMPTION' THEN 'Production / Job Consumption'
          WHEN l.transaction_type='MATERIAL_ISSUE' THEN 'Material Issue' ELSE l.transaction_type END AS transaction_type,
        l.reference_number, m.reel_number,
        CASE WHEN l.movement='IN' THEN l.quantity ELSE 0 END AS in_qty,
        CASE WHEN l.movement='OUT' THEN l.quantity ELSE 0 END AS out_qty,
        l.revised_stock AS balance, l.uom,
        CASE WHEN l.reference_type IN ('JOB_TRACKING','JOB_PROCESS') THEN 'Job Consumption' ELSE l.reference_type END AS source,
        creator.full_name AS created_by, approver.full_name AS approved_by
       FROM inventory_stock_ledger l
       INNER JOIN material_inventory_records m ON m.id=l.inventory_stock_id
       LEFT JOIN users creator ON creator.id=l.created_by_user_id
       LEFT JOIN users approver ON approver.id=l.approved_by_user_id
       WHERE l.inventory_stock_id=? AND l.transaction_at < datetime(?,'+1 day','-5 hours','-30 minutes')
       ORDER BY l.transaction_at ASC, l.id ASC`,
    ).bind(stockId, asOnDate).all()
    const transactions = Date.parse(String(initial.created_at)) < Date.parse(`${asOnDate}T18:30:00.000Z`) ? [{
      transaction_date: initial.created_at, transaction_type: 'Material Receipt', reference_number: initial.material_no,
      in_qty: initial.initial_quantity, out_qty: 0, balance: initial.initial_quantity, uom: 'KG', source: 'MATERIAL_INVENTORY',
      created_by: '', approved_by: '',
    }, ...(ledger.results ?? [])] : ledger.results ?? []
    return json({ transactions })
  }

  const clauses = [`m.created_at < datetime(?,'+1 day','-5 hours','-30 minutes')`]
  const filterValues: unknown[] = [asOnDate]
  const filters: Array<[string, string]> = [
    ['material_type', 'm.material_type = ?'], ['paper_type', 'm.paper_type = ?'],
    ['reel_number', 'm.reel_number LIKE ?'], ['gsm', 'm.gsm = ?'], ['bf', 'm.bf = ?'],
    ['reel_size', 'm.reel_size_cm = ?'], ['color', 'm.color = ?'], ['supplier', 'm.vendor_name = ?'],
    ['po_number', 'm.purchase_order_number LIKE ?'],
  ]
  for (const [key, clause] of filters) {
    const value = url.searchParams.get(key)?.trim()
    if (value) { clauses.push(clause); filterValues.push(['reel_number', 'po_number'].includes(key) ? `%${value}%` : value) }
  }
  const material = url.searchParams.get('material')?.trim()
  if (material) { clauses.push('(m.material_no LIKE ? OR m.item_name LIKE ?)'); filterValues.push(`%${material}%`, `%${material}%`) }
  const stockStatus = url.searchParams.get('stock_status')?.trim().toUpperCase() ?? ''
  const statusClause = stockStatus === 'IN_STOCK' ? 'closing_stock > 0' : stockStatus === 'ZERO_STOCK' ? 'ABS(closing_stock) < 0.000001' : ''
  const sortMap: Record<string, string> = { material_type: 'material_type', material: 'material_no', gsm: 'gsm', bf: 'bf', reel_size: 'reel_size_cm', closing_stock: 'closing_stock', last_transaction: 'last_transaction_date' }
  const sort = sortMap[url.searchParams.get('sort') ?? ''] ?? 'material_type, material_no, gsm, bf, reel_size_cm'
  const direction = url.searchParams.get('direction') === 'desc' ? 'DESC' : 'ASC'
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const requestedSize = Number(url.searchParams.get('page_size')) || 50
  const pageSize = Math.min(url.searchParams.get('export') === '1' ? 10000 : 200, Math.max(1, requestedSize))

  const cte = `WITH ledger_all AS (
      SELECT inventory_stock_id, SUM(CASE WHEN movement='IN' THEN quantity ELSE -quantity END) net_all
      FROM inventory_stock_ledger GROUP BY inventory_stock_id
    ), ledger_asof AS (
      SELECT inventory_stock_id,
        SUM(CASE WHEN movement='IN' THEN quantity ELSE -quantity END) net_asof,
        SUM(CASE WHEN transaction_type='Material Receipt' AND movement='IN' THEN quantity ELSE 0 END) received,
        SUM(CASE WHEN transaction_type IN ('Material Issue','MATERIAL_ISSUE') AND movement='OUT' THEN quantity ELSE 0 END) issued,
        SUM(CASE WHEN transaction_type='Material Return' AND movement='IN' THEN quantity ELSE 0 END) returned,
        SUM(CASE WHEN transaction_type='Stock Adjustment' AND movement='IN' THEN quantity ELSE 0 END) adjustment_increase,
        SUM(CASE WHEN transaction_type='Stock Adjustment' AND movement='OUT' THEN quantity ELSE 0 END) adjustment_decrease,
        MAX(transaction_at) last_transaction
      FROM inventory_stock_ledger WHERE transaction_at < datetime(?,'+1 day','-5 hours','-30 minutes') GROUP BY inventory_stock_id
    ), report AS (
      SELECT m.id, m.material_type, m.material_no, m.reel_number, m.paper_type, m.gsm, m.bf, m.reel_size_cm,
        m.color, m.vendor_name AS supplier, m.purchase_order_number, '' location_name,
        0 AS opening_stock,
        (m.reel_weight_kg - COALESCE(la.net_all,0)) + COALESCE(ld.received,0) AS received_qty,
        COALESCE(ld.issued,0) issued_qty, COALESCE(ld.returned,0) returned_qty,
        COALESCE(ld.adjustment_increase,0) adjustment_increase, COALESCE(ld.adjustment_decrease,0) adjustment_decrease,
        (m.reel_weight_kg - COALESCE(la.net_all,0)) + COALESCE(ld.net_asof,0) AS closing_stock,
        'KG' uom, CASE WHEN ((m.reel_weight_kg - COALESCE(la.net_all,0)) + COALESCE(ld.net_asof,0)) <= 0 THEN 'Consumed'
          WHEN reservation.id IS NOT NULL THEN 'Reserved' ELSE 'Available' END reel_status,
        reservation.job_number AS reserved_for_job,
        CASE WHEN ld.last_transaction > m.created_at THEN ld.last_transaction ELSE m.created_at END last_transaction_date,
        m.created_at AS received_date
      FROM material_inventory_records m
      LEFT JOIN ledger_all la ON la.inventory_stock_id=m.id
      LEFT JOIN ledger_asof ld ON ld.inventory_stock_id=m.id
      LEFT JOIN inventory_reel_reservations reservation ON reservation.inventory_stock_id=m.id AND reservation.status='ACTIVE'
      WHERE ${clauses.join(' AND ')}
    )`
  const commonValues = [asOnDate, ...filterValues]
  const whereStatus = statusClause ? `WHERE ${statusClause}` : ''
  const [count, rows, totals] = await Promise.all([
    context.env.DB.prepare(`${cte} SELECT COUNT(*) count FROM report ${whereStatus}`).bind(...commonValues).first<{ count: number }>(),
    context.env.DB.prepare(`${cte} SELECT * FROM report ${whereStatus} ORDER BY ${sort} ${direction} LIMIT ? OFFSET ?`).bind(...commonValues, pageSize, (page - 1) * pageSize).all(),
    context.env.DB.prepare(`${cte} SELECT uom, COUNT(*) total_materials, SUM(closing_stock) total_stock,
      SUM(CASE WHEN closing_stock>0 THEN 1 ELSE 0 END) in_stock,
      SUM(CASE WHEN ABS(closing_stock)<0.000001 THEN 1 ELSE 0 END) zero_stock,
      SUM(CASE WHEN closing_stock<0 THEN 1 ELSE 0 END) negative_stock
      FROM report ${whereStatus} GROUP BY uom`).bind(...commonValues).all(),
  ])
  return json({ rows: rows.results ?? [], totals: totals.results ?? [], page, pageSize, total: count?.count ?? 0, lowStockAvailable: false, asOnDate })
}
