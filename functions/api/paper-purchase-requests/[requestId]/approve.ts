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
    const validSnapshot = await db.prepare(
      `SELECT request.id
      FROM paper_purchase_requests request
      WHERE request.id = ?
        AND request.request_status = 'PENDING_APPROVAL'
        AND EXISTS (
          SELECT 1 FROM paper_purchase_request_items item
          WHERE item.paper_request_id = request.id
            AND item.is_paper_eligible = 1
        )
        AND NOT EXISTS (
          SELECT 1 FROM paper_purchase_request_items item
          WHERE item.paper_request_id = request.id
            AND item.is_paper_eligible = 1
            AND (
              item.total_paper_requirement_kg IS NULL
              OR item.total_paper_requirement_kg <= 0
              OR NOT EXISTS (
                SELECT 1 FROM paper_purchase_request_layers layer
                WHERE layer.paper_request_item_id = item.id
                  AND layer.total_paper_weight_kg > 0
              )
            )
        )`,
    ).bind(requestId).first<{ id: number }>()
    if (!validSnapshot) {
      const exists = await db.prepare(
        'SELECT request_status FROM paper_purchase_requests WHERE id = ?',
      ).bind(requestId).first<{ request_status: string }>()
      if (!exists) return Response.json({ success: false, error: 'Paper Purchase Request not found' }, { status: 404 })
      if (exists.request_status !== 'PENDING_APPROVAL') {
        return Response.json({ success: false, error: 'This Paper Purchase Request has already been processed by another user.' }, { status: 409 })
      }
      return Response.json({ success: false, error: 'The saved Paper Purchase Request is incomplete and cannot be approved' }, { status: 400 })
    }

    const results = await db.batch([
      db.prepare(
        `UPDATE paper_purchase_requests
        SET request_status = 'APPROVED', approved_by_user_id = ?,
          approved_by_name = ?, approved_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND request_status = 'PENDING_APPROVAL'`,
      ).bind(user.id, user.fullName, requestId),
      db.prepare(
        `INSERT INTO paper_purchase_request_history (
          paper_request_id, previous_status, new_status, action_type,
          action_by_user_id, action_by_name, action_at, created_at
        )
        SELECT ?, 'PENDING_APPROVAL', 'APPROVED', 'APPROVED', ?, ?,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        WHERE changes() = 1`,
      ).bind(requestId, user.id, user.fullName),
    ])
    if (!results[0].success || results[0].meta.changes !== 1) {
      return Response.json({ success: false, error: 'This Paper Purchase Request has already been processed by another user.' }, { status: 409 })
    }

    return Response.json({ success: true, status: 'APPROVED' })
  } catch {
    console.error('[paper-request-approvals] Approval failed')
    return Response.json({ success: false, error: 'Unable to approve the Paper Purchase Request' }, { status: 500 })
  }
}
