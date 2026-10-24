import { formatLeadDate } from '../../src/features/lead-management/leadDateFormatting'
import { getAuthenticatedUser } from '../lib/authenticatedUser'
import {
  leadAdmin,
  leadScope,
  leadPermissions,
  leadFields,
  validLeadDate,
  duplicatePredicate,
  duplicateValues,
} from '../lib/leadManagement'
import { leadStatuses, leadStatusReasonLabels, contactModes, type Lead } from '../../src/features/lead-management/leadTypes'
import { getZohoCustomers } from '../../lib/customers'
import type { ZohoEnv } from '../../lib/zoho'

interface Context {
  request: Request
  env: { DB?: D1Database } & ZohoEnv
}
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
const selectLead =
  'SELECT l.*,u.full_name AS coordinator_name FROM sales_leads l LEFT JOIN users u ON u.id=l.coordinator_id'
export async function onRequest({ request, env }: Context): Promise<Response> {
  try {
    if (!['GET', 'POST'].includes(request.method))
      return json({ error: 'Method not allowed.' }, 405)
    if (!env.DB) return json({ error: 'Lead database unavailable.' }, 503)
    const db = env.DB.withSession('first-primary') as unknown as D1Database
    const user = await getAuthenticatedUser(request, db)
    if (!user) return json({ error: 'Authentication required.' }, 401)
    const permissions = await leadPermissions(db, user)
    if (!permissions.view) return json({ error: 'Lead Management permission required.' }, 403)
    const readScope = leadScope(user, 'l', permissions.viewAll),
      params = new URL(request.url).searchParams
    const admin = leadAdmin(user)
    if (request.method === 'GET') {
      if (params.has('id')) {
        const id = Number(params.get('id'))
        if (!Number.isSafeInteger(id) || id <= 0)
          return json({ error: 'Select a valid lead.' }, 400)
        const lead = await db
          .prepare(`${selectLead} WHERE l.id=? AND ${readScope.sql}`)
          .bind(id, ...readScope.values)
          .first<Lead>()
        if (!lead) return json({ error: 'Lead not found.' }, 404)
        if (params.get('section') === 'form')
          return json({ lead, activities: [], history: [], customers: [] })
        // Each history query rechecks ownership, including if reassignment occurs after the first read.
        const activityQuery = db
          .prepare(
            `SELECT a.*,u.full_name AS user_name FROM sales_lead_activities a JOIN users u ON u.id=a.created_by JOIN sales_leads l ON l.id=a.lead_id WHERE l.id=? AND ${readScope.sql} ORDER BY a.contact_date DESC,a.id DESC`,
          )
          .bind(id, ...readScope.values)
        const historyQuery = db
          .prepare(
            `SELECT h.*,u.full_name AS user_name FROM sales_lead_history h JOIN users u ON u.id=h.changed_by JOIN sales_leads l ON l.id=h.lead_id WHERE l.id=? AND ${readScope.sql} ORDER BY h.id DESC`,
          )
          .bind(id, ...readScope.values)
        const [activities, history] = await db.batch([activityQuery, historyQuery])
        let customers: unknown[] = []
        if (params.get('customers') === '1' && permissions.edit)
          customers = await getZohoCustomers(env)
        const stillVisible = await db
          .prepare(`SELECT l.id FROM sales_leads l WHERE l.id=? AND ${readScope.sql}`)
          .bind(id, ...readScope.values)
          .first()
        if (!stillVisible) return json({ error: 'Lead not found.' }, 404)
        return json({ lead, activities: activities.results, history: history.results, customers })
      }
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      const summaryQuery = db
        .prepare(
          `SELECT status,COUNT(*) AS count,SUM(CASE WHEN next_follow_up_date=? THEN 1 ELSE 0 END) AS due,SUM(CASE WHEN next_follow_up_date<? THEN 1 ELSE 0 END) AS overdue FROM sales_leads l WHERE ${readScope.sql} GROUP BY status`,
        )
        .bind(today, today, ...readScope.values)
      if (params.get('summary') === '1') {
        const summary = await summaryQuery.all()
        return json({ summary: summary.results })
      }
      const where = [readScope.sql],
        values: (string | number)[] = [...readScope.values]
      const search = (params.get('search') || '').trim().slice(0, 200)
      if (search) {
        where.push(
          '(l.company LIKE ? OR l.contact LIKE ? OR l.mobile LIKE ? OR l.lead_number LIKE ?)',
        )
        values.push(...Array(4).fill(`%${search}%`))
      }
      if (params.get('status')) {
        where.push('l.status=?')
        values.push(params.get('status')!)
      }
      if (permissions.viewAll && params.get('coordinator')) {
        where.push('l.coordinator_id=?')
        values.push(Number(params.get('coordinator')))
      }
      if (params.get('follow_up')) {
        where.push('l.next_follow_up_date=?')
        values.push(validLeadDate(params.get('follow_up'), true)!)
      }
      const countQuery = db
        .prepare(`SELECT COUNT(*) AS total FROM sales_leads l WHERE ${where.join(' AND ')}`)
        .bind(...values)
      const page = Math.max(1, Math.min(1000000, Number(params.get('page')) || 1))
      const sort =
        params.get('sort') === 'follow_up'
          ? 'l.next_follow_up_date IS NULL,l.next_follow_up_date ASC,l.id DESC'
          : 'l.created_at DESC,l.id DESC'
      if (params.get('export') === 'csv') {
        const count = await countQuery.first<{ total: number }>()
        if ((count?.total || 0) > 5000)
          return json({ error: 'Filter the export to 5,000 leads or fewer.' }, 400)
        const rows = await db
          .prepare(`${selectLead} WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT 5000`)
          .bind(...values)
          .all<Lead>()
        const columns = [
          'lead_number',
          'company',
          'contact',
          'mobile',
          'email',
          'city',
          'source',
          'coordinator_name',
          'status',
          'status_reason',
          'last_contact_date',
          'next_follow_up_date',
          'created_at',
        ] as const
        const cell = (value: unknown) => {
          let s = String(value ?? '')
          if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`
          return `"${s.replaceAll('"', '""')}"`
        }
        const csv = [
          columns.join(','),
          ...rows.results.map((row) => columns.map((c) => cell(['last_contact_date', 'next_follow_up_date', 'created_at'].includes(c) ? formatLeadDate(row[c] as string | null, '') : row[c])).join(',')),
        ].join('\r\n')
        return new Response('\uFEFF' + csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="sales-leads.csv"',
            'Cache-Control': 'no-store',
          },
        })
      }
      const coordinatorQuery = db
        .prepare(
          "SELECT u.id,u.full_name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.status='ACTIVE' AND r.name='SALES' AND r.is_active=1 AND (?=1 OR u.id=?) ORDER BY u.full_name",
        )
        .bind(permissions.viewAll || permissions.reassign ? 1 : 0, user.id)
      const leadQuery = db
        .prepare(`${selectLead} WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT 25 OFFSET ?`)
        .bind(...values, (Math.floor(page) - 1) * 25)
      const [leads, count, summary, coordinators] = await db.batch([
        leadQuery, countQuery, summaryQuery, coordinatorQuery,
      ])
      return json({
        leads: leads.results,
        total: Number((count.results[0] as { total: number } | undefined)?.total || 0),
        summary: summary.results,
        coordinators: coordinators.results,
        permissions,
        admin,
        userId: user.id,
        today,
      })
    }
    const input = await request.json()
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return json({ error: 'Invalid request.' }, 400)
    const b = input as Record<string, unknown>,
      action = String(b.action || '')
    if (!['create', 'edit', 'status', 'followup', 'reassign', 'convert'].includes(action))
      return json({ error: 'Invalid action.' }, 400)
    if (!(action === 'create' ? permissions.create : permissions.edit))
      return json({ error: 'Write permission required.' }, 403)
    if (action === 'reassign' && !permissions.reassign)
      return json({ error: 'Lead reassignment permission required.' }, 403)
    const scope = leadScope(user, 'l', permissions.viewAll)
    const id = Number(b.id),
      token = crypto.randomUUID()
    if (action !== 'create' && (!Number.isSafeInteger(id) || id <= 0))
      return json({ error: 'Select a valid lead.' }, 400)
    const old =
      action === 'create'
        ? null
        : await db
            .prepare(`${selectLead} WHERE l.id=? AND ${scope.sql}`)
            .bind(id, ...scope.values)
            .first<Lead>()
    if (action !== 'create' && !old) return json({ error: 'Lead not found.' }, 404)
    if (old && Number(b.version) !== old.version)
      return json({ error: 'Lead changed. Refresh and retry.' }, 409)
    const assignments: string[] = [],
      args: (string | number | null)[] = []
    let duplicateGuard = '',
      duplicateArgs: string[] = []
    const changes: {field: string; previous: string | null; current: string | null}[] = []
    const set = (column: string, value: string | number | null) => {
      assignments.push(`${column}=?`)
      args.push(value)
      if (old && !['updated_by', 'mutation_token', 'closure_reason', 'coordinator_id'].includes(column)) {
        const before = (old as unknown as Record<string, unknown>)[column] ?? null
        if (String(before ?? '') !== String(value ?? ''))
          changes.push({field: column, previous: before == null ? null : String(before), current: value == null ? null : String(value)})
      }
    }
    if (action === 'create' || action === 'edit' || action === 'reassign') {
      const coordinator =
        action === 'edit' ? old!.coordinator_id : (admin || action === 'reassign') ? (b.coordinator_id ? Number(b.coordinator_id) : null) : user.id
      if (!admin && action === 'create' && b.coordinator_id != null && Number(b.coordinator_id) !== user.id)
        return json({ error: 'Sales users cannot assign another coordinator.' }, 403)
      const eligible = coordinator == null ? true : await db
        .prepare(
          "SELECT u.id,u.full_name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.status='ACTIVE' AND r.name='SALES' AND r.is_active=1",
        )
        .bind(coordinator)
        .first()
      if (!eligible) return json({ error: 'Select an active SALES coordinator.' }, 400)
      if (action !== 'edit') {
        set('coordinator_id', coordinator)
        if (old && old.coordinator_id !== coordinator) changes.push({field: 'coordinator_id', previous: old.coordinator_name || 'Unassigned', current: coordinator == null ? 'Unassigned' : String((eligible as {full_name: string}).full_name)})
      }
      if (action !== 'reassign') {
        const f = leadFields(b)
        const duplicate = await db
          .prepare(`SELECT id FROM sales_leads WHERE id!=? AND ${duplicatePredicate} LIMIT 1`)
          .bind(old?.id || 0, ...duplicateValues(f))
          .first()
        if (duplicate && b.confirm_duplicate !== true)
          return json(
            {
              error:
                'A potential duplicate exists by company, email or mobile. Confirm to save another lead.',
              duplicate: true,
            },
            409,
          )
        if (b.confirm_duplicate !== true) {
          duplicateGuard = ` AND NOT EXISTS(SELECT 1 FROM sales_leads WHERE id!=? AND ${duplicatePredicate})`
          duplicateArgs = duplicateValues(f)
        }
        for (const [k, v] of Object.entries(f)) set(k, v)
      }
    }
    if (action === 'status') {
      const status = String(b.status),
        reason = String(status === 'Closed' ? b.closure_reason || '' : b.status_reason || '').trim()
      if (!leadStatuses.some((s) => s === status) || status === 'Converted' || old!.customer_id)
        return json(
          {
            error: 'Use customer conversion to convert a lead. Converted leads cannot be reopened.',
          },
          400,
        )
      if (leadStatusReasonLabels[status] && !reason) return json({ error: `${leadStatusReasonLabels[status]} is required.` }, 400)
      if (reason.length > 2000) return json({ error: 'Status reason cannot exceed 2,000 characters.' }, 400)
      set('status', status)
      set('closure_reason', status === 'Closed' ? reason : '')
      set('status_reason', leadStatusReasonLabels[status] ? reason : '')
      if (status === 'Closed') set('next_follow_up_date', null)
    }
    let activity: (string | number | null)[] | null = null
    if (action === 'followup') {
      const date = validLeadDate(b.contact_date, true),
        next = validLeadDate(b.next_follow_up_date),
        mode = String(b.mode),
        discussion = String(b.discussion || '').trim(),
        nextAction = String(b.next_action || '').trim()
      if (
        !contactModes.some((m) => m === mode) ||
        !discussion ||
        discussion.length > 4000 ||
        nextAction.length > 2000
      )
        return json(
          { error: 'Select a contact mode and enter discussion (up to 4,000 characters).' },
          400,
        )
      if (next && next < date!)
        return json({ error: 'Next follow-up cannot precede contact date.' }, 400)
      if (!['Converted', 'Closed'].includes(old!.status) && !next)
        return json({ error: 'Schedule the next follow-up for this active lead.' }, 400)
      set(
        'last_contact_date',
        old!.last_contact_date && old!.last_contact_date > date! ? old!.last_contact_date : date,
      )
      set('next_follow_up_date', next)
      activity = [date, mode, discussion, next, nextAction, user.id]
    }
    if (action === 'convert') {
      if (b.confirm !== true) return json({ error: 'Confirm customer conversion.' }, 400)
      if (!['Qualified', 'Quotation'].includes(old!.status) || old!.customer_id)
        return json({ error: 'Only qualified or quotation leads can be converted once.' }, 409)
      const customers = await getZohoCustomers(env),
        customer = customers.find((c) => c.customer_id === String(b.customer_id))
      if (!customer) return json({ error: 'Select a verified active Zoho Books customer.' }, 400)
      set('customer_id', customer.customer_id)
      set('status', 'Converted')
      set('next_follow_up_date', null)
    }
    set('updated_by', user.id)
    set('mutation_token', token)
    if (action === 'create') {
      const columns = assignments.map((s) => s.slice(0, -2))
      columns.push('created_by')
      args.push(user.id)
      const result = await db
        .prepare(
          `INSERT INTO sales_leads(${columns.join(',')}) SELECT ${columns.map(() => '?').join(',')} WHERE 1=1${duplicateGuard}`,
        )
        .bind(...args, ...(duplicateGuard ? [0, ...duplicateArgs] : []))
        .run()
      if (!result.meta.changes)
        return json(
          {
            error: 'A potential duplicate was just saved. Confirm to save another lead.',
            duplicate: true,
          },
          409,
        )
    } else {
      const update = db
        .prepare(
          `UPDATE sales_leads AS l SET ${assignments.join(',')},version=version+1,updated_at=CURRENT_TIMESTAMP WHERE l.id=? AND l.version=? AND ${scope.sql}${duplicateGuard}`,
        )
        .bind(
          ...args,
          id,
          old!.version,
          ...scope.values,
          ...(duplicateGuard ? [id, ...duplicateArgs] : []),
        )
      const statements = [update]
      if (activity)
        statements.push(
          db
            .prepare(
              `INSERT INTO sales_lead_activities(lead_id,contact_date,mode,discussion,next_follow_up_date,next_action,created_by) SELECT id,?,?,?,?,?,? FROM sales_leads WHERE id=? AND mutation_token=?`,
            )
            .bind(...activity, id, token),
        )
      if (activity) {
        changes.push({field: 'contact_date', previous: null, current: String(activity[0])})
        changes.push({field: 'contact_mode', previous: null, current: String(activity[1])})
        changes.push({field: 'discussion', previous: null, current: String(activity[2])})
        if (activity[4]) changes.push({field: 'next_action', previous: null, current: String(activity[4])})
      }
      statements.push(db.prepare(`UPDATE sales_lead_history SET changes_json=?
        WHERE lead_id=? AND event='Updated' AND new_value=?
        AND EXISTS(SELECT 1 FROM sales_leads WHERE id=? AND mutation_token=?)`)
        .bind(JSON.stringify({action, changes}), id, String(old!.version + 1), id, token))
      const result = await db.batch(statements)
      if (!result[0].meta.changes)
        return json({ error: 'Lead changed or access was revoked. Refresh and retry.' }, 409)
    }
    return json({ success: true })
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400)
    if (error instanceof Error && /required|valid|exceed|Select|cannot|Enter/.test(error.message))
      return json({ error: error.message }, 400)
    console.error('[lead-management]', error)
    return json({ error: 'Unable to complete lead request. Please retry.' }, 500)
  }
}
