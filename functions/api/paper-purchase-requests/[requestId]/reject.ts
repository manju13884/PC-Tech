import { getAuthenticatedUser } from '../../../lib/authenticatedUser'
import {
  hasPaperRequestPermission,
  PAPER_REQUEST_APPROVALS_MENU_KEY,
} from '../../../lib/paperRequestPermissions'

interface Context {
  request: Request
  env: { DB?: D1Database }
  params: { requestId?: string }
}

export async function onRequestPost(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return Response.json({ success: false, error: 'Paper request database is unavailable' }, { status: 500 })

  let reason = ''
  try {
    const body = await context.request.json() as { reason?: unknown }
    reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  } catch {
    return Response.json({ success: false, error: 'Request body must be valid JSON' }, { status: 400 })
  }
  if (reason.length < 5) {
    return Response.json({ success: false, error: 'Enter a reason of at least 5 characters before rejecting the Paper Purchase Request.' }, { status: 400 })
  }
  if (reason.length > 1000) {
    return Response.json({ success: false, error: 'Rejection reason must not exceed 1000 characters' }, { status: 400 })
  }

  try {
    const user = await getAuthenticatedUser(context.request, db)
    if (!user) return Response.json({ success: false, error: 'Authentication required' }, { status: 401 })
    if (!await hasPaperRequestPermission(db, user, PAPER_REQUEST_APPROVALS_MENU_KEY, 'approve')) {
      return Response.json({ success: false, error: 'Paper Purchase Request approval access required' }, { status: 403 })
    }
    const requestId = Number(context.params.requestId)
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return Response.json({ success: false, error: 'A valid request ID is required' }, { status: 400 })
    }

    const results = await db.batch([
      db.prepare(
        `UPDATE paper_purchase_requests
        SET request_status = 'REJECTED', rejection_reason = ?,
          rejected_by_user_id = ?, rejected_by_name = ?,
          rejected_at = CURRENT_TIMESTAMP, approved_by_user_id = NULL,
          approved_by_name = NULL, approved_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND request_status = 'PENDING_APPROVAL'`,
      ).bind(reason, user.id, user.fullName, requestId),
      db.prepare(
        `INSERT INTO paper_purchase_request_history (
          paper_request_id, previous_status, new_status, action_type,
          action_reason, action_by_user_id, action_by_name, action_at, created_at
        )
        SELECT ?, 'PENDING_APPROVAL', 'REJECTED', 'REJECTED', ?, ?, ?,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        WHERE changes() = 1`,
      ).bind(requestId, reason, user.id, user.fullName),
    ])
    if (!results[0].success || results[0].meta.changes !== 1) {
      const exists = await db.prepare('SELECT id FROM paper_purchase_requests WHERE id = ?')
        .bind(requestId).first()
      return Response.json({
        success: false,
        error: exists
          ? 'This Paper Purchase Request has already been processed by another user.'
          : 'Paper Purchase Request not found',
      }, { status: exists ? 409 : 404 })
    }

    return Response.json({ success: true, status: 'REJECTED' })
  } catch {
    console.error('[paper-request-approvals] Rejection failed')
    return Response.json({ success: false, error: 'Unable to reject the Paper Purchase Request' }, { status: 500 })
  }
}
