import { getZohoOpenSalesOrderSummary } from '../../lib/salesOrders'
import { getZohoInvoiceDashboardSummary } from '../../lib/invoices'
import { ZohoRequestError, type ZohoEnv } from '../../lib/zoho'

interface PagesFunctionContext {
  request: Request
  env: ZohoEnv & { DB: D1Database }
}

interface DashboardPayload {
  salesOrders: Awaited<ReturnType<typeof getZohoOpenSalesOrderSummary>> | null
  invoices: Awaited<ReturnType<typeof getZohoInvoiceDashboardSummary>> | null
  errors: { sales: string | null; finance: string | null }
  cached?: boolean
  refreshedAt?: string
}

const IST_TIME_ZONE = 'Asia/Kolkata'
const REFRESH_HOUR_IST = 7

function getDashboardBusinessDate(now = new Date()): string {
  const shifted = new Date(now.getTime() - REFRESH_HOUR_IST * 60 * 60 * 1000)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(shifted)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function parseSnapshot(value: string | null): DashboardPayload | null {
  if (!value) return null
  try {
    return JSON.parse(value) as DashboardPayload
  } catch {
    return null
  }
}

async function readLatestSnapshot(db: D1Database): Promise<DashboardPayload | null> {
  const row = await db.prepare(
    `SELECT payload_json FROM dashboard_snapshots
     WHERE payload_json IS NOT NULL
     ORDER BY business_date DESC LIMIT 1`,
  ).first<{ payload_json: string }>()
  return parseSnapshot(row?.payload_json ?? null)
}

function getDashboardError(reason: unknown, area: 'Sales' | 'Finance'): string {
  if (reason instanceof ZohoRequestError && (reason.status === 429 || reason.code === '45')) {
    return `Zoho API limit reached. ${area} data will refresh after Zoho resets the quota; existing data is unchanged.`
  }
  return `Unable to load ${area.toLowerCase()} data.`
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  try {
    const businessDate = getDashboardBusinessDate()
    const snapshotKey = `home:${businessDate}`
    const existing = await context.env.DB.prepare(
      'SELECT payload_json FROM dashboard_snapshots WHERE snapshot_key = ?',
    ).bind(snapshotKey).first<{ payload_json: string | null }>()
    const existingPayload = parseSnapshot(existing?.payload_json ?? null)
    if (existingPayload) {
      return Response.json({ ...existingPayload, cached: true }, { status: 200 })
    }

    const claim = await context.env.DB.prepare(
      `INSERT OR IGNORE INTO dashboard_snapshots (snapshot_key, business_date)
       VALUES (?, ?)`,
    ).bind(snapshotKey, businessDate).run()
    if ((claim.meta.changes ?? 0) === 0) {
      const previous = await readLatestSnapshot(context.env.DB)
      if (previous) return Response.json({ ...previous, cached: true }, { status: 200 })
      return Response.json({
        salesOrders: null,
        invoices: null,
        errors: { sales: 'Daily dashboard refresh is in progress.', finance: 'Daily dashboard refresh is in progress.' },
        cached: true,
      } satisfies DashboardPayload, { status: 200 })
    }
    const [salesOrdersResult, invoicesResult] = await Promise.allSettled([
      getZohoOpenSalesOrderSummary(context.env),
      getZohoInvoiceDashboardSummary(context.env),
    ])
    if (salesOrdersResult.status === 'rejected') {
      console.error('[home-sales-orders] sales summary failed', {
        message: salesOrdersResult.reason instanceof Error ? salesOrdersResult.reason.message : String(salesOrdersResult.reason),
      })
    }
    if (invoicesResult.status === 'rejected') {
      console.error('[home-sales-orders] invoice summary failed', {
        message: invoicesResult.reason instanceof Error ? invoicesResult.reason.message : String(invoicesResult.reason),
      })
    }
    const payload: DashboardPayload = {
      salesOrders: salesOrdersResult.status === 'fulfilled' ? salesOrdersResult.value : null,
      invoices: invoicesResult.status === 'fulfilled' ? invoicesResult.value : null,
      errors: {
        sales: salesOrdersResult.status === 'rejected' ? getDashboardError(salesOrdersResult.reason, 'Sales') : null,
        finance: invoicesResult.status === 'rejected' ? getDashboardError(invoicesResult.reason, 'Finance') : null,
      },
      refreshedAt: new Date().toISOString(),
    }
    const bothFailed = !payload.salesOrders && !payload.invoices
    if (!bothFailed) {
      await context.env.DB.prepare(
        `UPDATE dashboard_snapshots
         SET payload_json = ?, refreshed_at = CURRENT_TIMESTAMP
         WHERE snapshot_key = ?`,
      ).bind(JSON.stringify(payload), snapshotKey).run()
    } else {
      const previous = await readLatestSnapshot(context.env.DB)
      if (previous) return Response.json({ ...previous, cached: true }, { status: 200 })
    }
    return Response.json(payload, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load sales order summary'
    const status = error instanceof ZohoRequestError ? error.status : 502
    console.error('[home-sales-orders] request failed', { status, message })
    return Response.json({ error: 'Sales order summary is temporarily unavailable.' }, { status: 502 })
  }
}
