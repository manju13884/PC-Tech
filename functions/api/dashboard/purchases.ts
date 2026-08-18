import { getAuthenticatedUser } from '../../lib/authenticatedUser'

interface Context {
  request: Request
  env: { DB?: D1Database }
}

export async function onRequestGet(context: Context): Promise<Response> {
  if (!context.env.DB) return Response.json({ error: 'Purchase summary is unavailable.' }, { status: 503 })
  const user = await getAuthenticatedUser(context.request, context.env.DB)
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const result = await context.env.DB.prepare(`
      SELECT request_status AS status, COUNT(*) AS count
      FROM paper_purchase_requests
      GROUP BY request_status
    `).all<{ status: string; count: number }>()
    const counts = { pendingApproval: 0, approvedPendingPo: 0, rejected: 0, openRequests: 0 }
    for (const row of result.results) {
      const count = Number(row.count) || 0
      if (row.status === 'PENDING_APPROVAL') counts.pendingApproval = count
      if (row.status === 'APPROVED') counts.approvedPendingPo = count
      if (row.status === 'REJECTED') counts.rejected = count
      counts.openRequests += count
    }
    return Response.json(counts)
  } catch {
    return Response.json({ error: 'Unable to load purchase summary.' }, { status: 500 })
  }
}
