import { getAuthenticatedUser } from '../lib/authenticatedUser'
import { masterDataFields, validMasterDataValue } from '../../src/features/master-data/masterDataFields'

interface Context { request: Request; env: { DB?: D1Database } }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function readMasterData(db: D1Database) {
  return Object.fromEntries(await Promise.all(masterDataFields.map(async field => {
    const row = await db.prepare('SELECT value FROM master_data WHERE key = ?').bind(field.key).first<{ value: string }>()
    return [field.name, row?.value.trim() || field.defaultValue]
  })))
}

async function handle(context: Context, save: boolean): Promise<Response> {
  const db = context.env.DB
  if (!db) return json({ error: 'Master Data database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  const permissions = user.roleName === 'SUPERADMIN' ? { can_full: 1, can_view: 1, can_edit: 1 } : await db.prepare(
    "SELECT can_full, can_view, can_edit FROM role_menu_permissions WHERE role_id = ? AND menu_key = 'master-data'",
  ).bind(user.roleId).first<{ can_full: number; can_view: number; can_edit: number }>()
  const canEdit = Boolean(permissions?.can_full || permissions?.can_edit)
  if (save ? !canEdit : !(permissions?.can_full || permissions?.can_view || canEdit)) {
    return json({ error: 'Master Data access is required.' }, 403)
  }
  if (save) {
    const body = await context.request.json<Record<string, unknown>>().catch(() => null)
    if (!body || typeof body.paperPrice !== 'string') return json({ error: 'Paper price is required.' }, 400)
    const values: Record<string, string> = {}
    for (const field of masterDataFields) {
      if (!(field.name in body)) continue
      if (typeof body[field.name] !== 'string') return json({ error: `${field.label} must be a number.` }, 400)
      const value = (body[field.name] as string).trim() || field.defaultValue
      if (!validMasterDataValue(value, field.name)) return json({ error: field.name === 'maximumMachineDeckle' ? 'Maximum Machine Deckle must be greater than zero.' : `Enter a valid, non-negative ${field.label}.` }, 400)
      values[field.name] = value
    }
    await db.batch(masterDataFields.filter(field => field.name in values).map(field =>
      db.prepare('INSERT INTO master_data (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP').bind(field.key, values[field.name]),
    ))
  }
  const values = await readMasterData(db)
  return json({ ...values, canEdit })
}

export const onRequestGet = (context: Context) => handle(context, false)
export const onRequestPut = (context: Context) => handle(context, true)
