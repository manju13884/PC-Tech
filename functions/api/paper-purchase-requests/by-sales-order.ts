import { getAuthenticatedUser } from '../../lib/authenticatedUser'
import { loadPaperRequestBySalesOrder } from '../../lib/paperPurchaseRequests'
import { hasPaperRequestPermission, PAPER_REQUEST_MENU_KEY } from '../../lib/paperRequestPermissions'

interface Env {
  DB?: D1Database
}

interface FunctionContext {
  request: Request
  env: Env
}

export async function onRequestGet(context: FunctionContext): Promise<Response> {
  if (!context.env.DB) {
    return Response.json({ success: false, error: 'Paper request database is unavailable' }, { status: 500 })
  }

  try {
    const user = await getAuthenticatedUser(context.request, context.env.DB)
    if (!user) {
      return Response.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }
    if (!await hasPaperRequestPermission(context.env.DB, user, PAPER_REQUEST_MENU_KEY, 'view')) {
      return Response.json({ success: false, error: 'Paper Purchase Request access required' }, { status: 403 })
    }

    const salesOrderId = new URL(context.request.url).searchParams.get('salesOrderId')?.trim() ?? ''
    if (!salesOrderId) {
      return Response.json({ success: false, error: 'salesOrderId is required' }, { status: 400 })
    }

    const request = await loadPaperRequestBySalesOrder(context.env.DB, salesOrderId)
    return Response.json({ exists: request !== null, request }, { status: 200 })
  } catch {
    console.error('[paper-purchase-requests] Unable to load request by Sales Order')
    return Response.json({ success: false, error: 'Unable to load the Paper Purchase Request' }, { status: 500 })
  }
}
