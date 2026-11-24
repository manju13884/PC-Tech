import { getZohoItems } from '../../../lib/items'
import { PRODUCTION_ITEMS_KEY, readProductionPlanningItems } from '../../../lib/productionPlanningItems'
import type { ZohoEnv } from '../../../lib/zoho'
import { getAuthenticatedUser } from '../../lib/authenticatedUser'

type Context = { request: Request; env: ZohoEnv & { DB?: D1Database } }
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
async function access(context: Context, edit: boolean) {
  const db = context.env.DB
  if (!db) return { error: json({ error: 'Database unavailable.' }, 503) }
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return { error: json({ error: 'Authentication required.' }, 401) }
  const permissions = user.roleName === 'SUPERADMIN' ? { can_full: 1, can_view: 1, can_edit: 1 } : await db.prepare("SELECT can_full, can_view, can_edit FROM role_menu_permissions WHERE role_id = ? AND menu_key = 'master-data'").bind(user.roleId).first<{ can_full: number; can_view: number; can_edit: number }>()
  if (edit ? !(permissions?.can_full || permissions?.can_edit) : !(permissions?.can_full || permissions?.can_view || permissions?.can_edit)) return { error: json({ error: 'Master Data access is required.' }, 403) }
  return { db }
}
export async function onRequestGet(context: Context) {
  const result = await access(context, false)
  if (!result.db) return result.error!
  try {
    const [items, selected] = await Promise.all([getZohoItems(context.env, { includeInactive: true }), readProductionPlanningItems(result.db)])
    return json({ items, selectedIds: [...selected] })
  } catch { return json({ error: 'Unable to load Books items. Please retry.' }, 502) }
}
export async function onRequestPut(context: Context) {
  const result = await access(context, true)
  if (!result.db) return result.error!
  const body = await context.request.json<{ selectedIds?: unknown }>().catch(() => null)
  if (!Array.isArray(body?.selectedIds) || !body.selectedIds.every((id: unknown) => typeof id === 'string' && id.trim() && id.length <= 100)) return json({ error: 'Invalid item selection.' }, 400)
  const ids = [...new Set(body.selectedIds.map((id: string) => id.trim()))]
  await result.db.prepare('INSERT INTO master_data (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP').bind(PRODUCTION_ITEMS_KEY, JSON.stringify(ids)).run()
  return json({ selectedIds: ids })
}
