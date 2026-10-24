import { getAuthenticatedUser } from '../../lib/authenticatedUser'
import { productionSummaryDate, productionSummarySql } from '../../../lib/dashboardProduction'

interface Context { request: Request; env: { DB?: D1Database } }
interface ProductionSummary { pendingProduction: number; dueToday: number; overdue: number }

const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
})

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const db = env.DB
  if (!db) return json({ error: 'Production summary is unavailable.' }, 503)
  const user = await getAuthenticatedUser(request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  try {
    if (user.roleName !== 'SUPERADMIN') {
      const permission = await db.prepare(`SELECT 1 AS allowed FROM role_menu_permissions
        WHERE role_id = ? AND menu_key IN ('production-planned', 'job-cards', 'job-tracking', 'so-production-status')
          AND (can_full = 1 OR can_view = 1) LIMIT 1`).bind(user.roleId).first()
      if (!permission) return json({ error: 'Production view access is required.' }, 403)
    }
    const today = productionSummaryDate()
    const summary = await db.prepare(productionSummarySql).bind(today, today).first<ProductionSummary>()
    return json(summary ?? { pendingProduction: 0, dueToday: 0, overdue: 0 })
  } catch {
    return json({ error: 'Unable to load production summary.' }, 500)
  }
}
