import { getAuthenticatedUser } from '../lib/authenticatedUser'

interface Env { DB?: D1Database }
interface Context { request: Request; env: Env }

const response = (payload: unknown, status = 200) => Response.json(payload, {
  status,
  headers: { 'Cache-Control': 'no-store' },
})

async function hasPermission(db: D1Database, roleId: number, roleName: string, action: 'view' | 'save') {
  if (roleName === 'SUPERADMIN') return true
  const row = await db.prepare(
    `SELECT can_full, can_view, can_create, can_edit
     FROM role_menu_permissions WHERE role_id = ? AND menu_key = 'product-specifications'`,
  ).bind(roleId).first<{ can_full: number; can_view: number; can_create: number; can_edit: number }>()
  return Boolean(row && (row.can_full === 1 || (action === 'view' ? row.can_view === 1 : row.can_create === 1 || row.can_edit === 1)))
}

export async function onRequestGet(context: Context): Promise<Response> {
  if (!context.env.DB) return response({ error: 'Product specification database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, context.env.DB)
  if (!user) return response({ error: 'Authentication required.' }, 401)
  if (!await hasPermission(context.env.DB, user.roleId, user.roleName, 'view')) return response({ error: 'View access required.' }, 403)

  const url = new URL(context.request.url)
  const customerId = url.searchParams.get('customer_id')?.trim()
  const itemId = url.searchParams.get('item_id')?.trim()
  if (!customerId || !itemId) {
    const specifications = await context.env.DB.prepare(
      `SELECT id, specification_name, polar_canvas_item_code, customer_id, customer_name, item_id, item_name, item_sku, specification_type,
        length_mm, width_mm, height_mm, ply, gsm, bf, print_required, print_colors, notes, attributes_json, updated_at
       FROM product_specification_records
       ORDER BY updated_at DESC, customer_name ASC, item_name ASC`,
    ).all()
    return response({ specifications: specifications.results ?? [] })
  }

  const specification = await context.env.DB.prepare(
    `SELECT id, specification_name, polar_canvas_item_code, customer_id, customer_name, item_id, item_name, item_sku, specification_type,
      length_mm, width_mm, height_mm, ply, gsm, bf, print_required, print_colors, notes, attributes_json, updated_at
     FROM product_specification_records WHERE customer_id = ? AND item_id = ? ORDER BY updated_at DESC LIMIT 1`,
  ).bind(customerId, itemId).first()
  return response({ specification: specification ?? null })
}

export async function onRequestPost(context: Context): Promise<Response> {
  if (!context.env.DB) return response({ error: 'Product specification database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, context.env.DB)
  if (!user) return response({ error: 'Authentication required.' }, 401)
  if (!await hasPermission(context.env.DB, user.roleId, user.roleName, 'save')) return response({ error: 'Create or edit access required.' }, 403)

  const body = await context.request.json<Record<string, unknown>>().catch(() => ({}))
  const text = (key: string) => typeof body[key] === 'string' ? body[key].trim() : ''
  const number = (key: string) => body[key] === '' || body[key] == null ? null : Number(body[key])
  const customerId = text('customer_id')
  const customerName = text('customer_name')
  const itemId = text('item_id')
  const itemName = text('item_name')
  const recordId = Number(body.id)
  if (!customerId || !customerName || !itemId || !itemName) {
    return response({ error: 'Customer and item are required.' }, 400)
  }

  const values = ['length_mm', 'width_mm', 'height_mm', 'ply', 'gsm', 'bf'] as const
  const numbers = Object.fromEntries(values.map((key) => [key, number(key)]))
  if (Object.values(numbers).some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
    return response({ error: 'Specification measurements must be valid positive numbers.' }, 400)
  }
  const attributes: Record<string, unknown> = Object.fromEntries([
    'flute_type', 'paper_type', 'material', 'shade_color', 'finish', 'thickness_micron', 'roll_length_m', 'joint_type',
  ].map((key) => [key, text(key)]))
  const paperLayers = Array.isArray(body.paper_layers) ? body.paper_layers
    .filter((layer): layer is Record<string, unknown> => Boolean(layer) && typeof layer === 'object')
    .slice(0, 9)
    .map((layer) => ({
      layer_name: typeof layer.layer_name === 'string' ? layer.layer_name.trim().slice(0, 50) : '',
      paper_grade: typeof layer.paper_grade === 'string' ? layer.paper_grade.trim().slice(0, 100) : '',
      gsm: layer.gsm == null || layer.gsm === '' ? '' : String(layer.gsm),
      bf_rct: layer.bf_rct == null || layer.bf_rct === '' ? '' : String(layer.bf_rct),
      shade: typeof layer.shade === 'string' && ['GYT', 'Natural', 'White'].includes(layer.shade) ? layer.shade : '',
      flute: typeof layer.flute === 'string' && ['A', 'B', 'C', 'E', 'F'].includes(layer.flute) ? layer.flute : '',
    })) : []
  attributes.paper_layers = paperLayers

  const commonValues = [
    customerId, customerName, itemId, itemName, text('item_sku'), text('specification_type') || 'GENERAL',
    numbers.length_mm, numbers.width_mm, numbers.height_mm, numbers.ply, numbers.gsm, numbers.bf,
    body.print_required === true ? 1 : 0, text('print_colors'), text('notes'), JSON.stringify(attributes), user.id,
  ]
  let saved
  if (Number.isInteger(recordId) && recordId > 0) {
    saved = await context.env.DB.prepare(
      `UPDATE product_specification_records SET
        customer_id = ?, customer_name = ?, item_id = ?, item_name = ?, item_sku = ?,
        specification_type = ?, length_mm = ?, width_mm = ?, height_mm = ?, ply = ?, gsm = ?, bf = ?,
        print_required = ?, print_colors = ?, notes = ?, attributes_json = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? RETURNING id, updated_at`,
    ).bind(...commonValues, recordId).first()
  } else {
    const inserted = await context.env.DB.prepare(
      `INSERT INTO product_specification_records (
        specification_name, customer_id, customer_name, item_id, item_name, item_sku, specification_type,
        length_mm, width_mm, height_mm, ply, gsm, bf, print_required, print_colors, notes, attributes_json,
        created_by_user_id, updated_by_user_id
      ) VALUES ('AUTO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    ).bind(...commonValues, user.id).run()
    const newId = Number(inserted.meta.last_row_id)
    const generatedCode = `PC-${String(newId).padStart(4, '0')}`
    saved = await context.env.DB.prepare(
      `UPDATE product_specification_records
       SET specification_name = ?, polar_canvas_item_code = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? RETURNING id, polar_canvas_item_code, updated_at`,
    ).bind(generatedCode, generatedCode, newId).first()
  }
  return response({ success: true, specification: saved })
}
