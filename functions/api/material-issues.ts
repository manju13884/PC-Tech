import { getAuthenticatedUser, type AuthenticatedUser } from '../lib/authenticatedUser'
import { getZohoInvoiceById } from '../../lib/invoices'
import { getZohoCustomers } from '../../lib/customers'
import type { ZohoEnv } from '../../lib/zoho'

interface Env extends ZohoEnv { DB?: D1Database }
interface Context { request: Request; env: Env }
const json = (payload: unknown, status = 200) => Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })

async function permission(db: D1Database, user: AuthenticatedUser, action: 'view' | 'create' | 'edit') {
  if (user.roleName === 'SUPERADMIN') return true
  const row = await db.prepare(`SELECT can_full,can_view,can_create,can_edit FROM role_menu_permissions
    WHERE role_id=? AND menu_key='material-issue-return'`).bind(user.roleId).first<{can_full:number;can_view:number;can_create:number;can_edit:number}>()
  return Boolean(row && (row.can_full === 1 || (action === 'view' ? row.can_view === 1 : action === 'create' ? row.can_create === 1 : row.can_edit === 1)))
}

const issueSelect = `SELECT issue.*, stock.material_no, stock.paper_type, stock.item_name, stock.item_description,
  stock.reel_number, stock.gsm, stock.bf, stock.reel_size_cm, stock.color
  FROM inventory_material_issues issue
  INNER JOIN material_inventory_records stock ON stock.id=issue.inventory_stock_id
  ORDER BY issue.created_at DESC, issue.id DESC`

async function cachedCustomer(env: Env, customerId: string) {
  if (!env.DB) return null
  const findCustomer = (payloadJson: string) => {
    try {
      const customers = JSON.parse(payloadJson) as Array<{customer_id?:unknown;customer_name?:unknown}>
      const customer = customers.find((value) => value.customer_id === customerId)
      return customer && typeof customer.customer_name === 'string' ? { id: customerId, name: customer.customer_name } : null
    } catch { return null }
  }
  const cache = await env.DB.prepare("SELECT payload_json FROM customer_cache WHERE cache_key='active-customers'").first<{payload_json:string}>()
  const cached = cache ? findCustomer(cache.payload_json) : null
  if (cached) return cached
  try {
    const customers = await getZohoCustomers(env)
    const refreshedAt = new Date().toISOString()
    await env.DB.prepare(`INSERT INTO customer_cache (cache_key,payload_json,refreshed_at) VALUES ('active-customers',?,?)
      ON CONFLICT(cache_key) DO UPDATE SET payload_json=excluded.payload_json,refreshed_at=excluded.refreshed_at`)
      .bind(JSON.stringify(customers),refreshedAt).run()
    return findCustomer(JSON.stringify(customers))
  } catch (error) {
    console.error('[material-issues] customer cache refresh failed',error)
    return null
  }
}

async function validateInvoice(env:Env,invoiceId:string,invoiceNumber:string,customerId:string) {
  if(!invoiceId) return { error:'Please select Invoice Number.' }
  try {
    const invoice=await getZohoInvoiceById(invoiceId,env)
    if(!invoice||invoice.customer_id!==customerId||invoice.invoice_number!==invoiceNumber)
      return { error:'The selected Invoice does not belong to the selected Customer. Please select a valid Invoice.' }
    if(['void','deleted'].includes(invoice.status.toLowerCase())) return { error:'The selected Invoice is Void or deleted and cannot be used.' }
    return { invoice }
  } catch(error) {
    console.error('[material-issues] invoice validation failed',error)
    return { error:'Unable to validate the selected Invoice with Zoho Books. Please try again.' }
  }
}

async function responseData(db: D1Database, user: AuthenticatedUser) {
  const [issues, materials] = await Promise.all([
    db.prepare(issueSelect).all(),
    db.prepare(`SELECT stock.id AS inventory_stock_id,stock.material_no,stock.material_type,stock.paper_type,
      stock.item_name,stock.item_description,stock.reel_number,stock.gsm,stock.bf,stock.reel_size_cm,
      stock.color,stock.reel_weight_kg AS available_stock,'KG' AS uom
      FROM material_inventory_records stock
      WHERE stock.status='Available' AND stock.reel_weight_kg>0
        AND NOT EXISTS(SELECT 1 FROM inventory_reel_reservations reservation
          WHERE reservation.inventory_stock_id=stock.id AND reservation.status='ACTIVE')
      ORDER BY stock.material_type,stock.item_name,stock.reel_number`).all(),
  ])
  return { issues: issues.results ?? [], materials: materials.results ?? [], currentUser: { id: user.id, fullName: user.fullName } }
}

export async function onRequestGet(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return json({ error: 'Material Issue database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (!await permission(db,user,'view')) return json({ error: 'Material Issue view access is required.' }, 403)
  return json(await responseData(db,user))
}

export async function onRequestPost(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return json({ error: 'Material Issue database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  const body = await context.request.json<Record<string,unknown>>().catch(() => ({}))
  const text = (key:string) => typeof body[key] === 'string' ? body[key].trim() : ''
  const action = text('action') || 'save_draft'
  const id = Number(body.id)

  if (action === 'complete') {
    if (!await permission(db,user,'edit')) return json({ error: 'Material Issue completion access is required.' }, 403)
    if (!Number.isInteger(id) || id<=0) return json({ error: 'Select a valid Material Issue.' }, 400)
    const issue = await db.prepare('SELECT * FROM inventory_material_issues WHERE id=?').bind(id).first<Record<string,unknown>>()
    if (!issue) return json({ error: 'Material Issue was not found.' }, 404)
    if (issue.status === 'COMPLETED') return json({ success:true, id, status:'COMPLETED', ...(await responseData(db,user)) })
    const customer=await cachedCustomer(context.env,String(issue.zoho_customer_id))
    if(!customer) return json({ error:'Please select Customer.' },400)
    const invoiceValidation=await validateInvoice(context.env,String(issue.zoho_invoice_id??''),String(issue.invoice_number??''),customer.id)
    if('error' in invoiceValidation) return json({ error:invoiceValidation.error },400)
    const reservation = await db.prepare(`SELECT reservation.job_number,reservation.process_name,stock.reel_number
      FROM inventory_reel_reservations reservation INNER JOIN material_inventory_records stock ON stock.id=reservation.inventory_stock_id
      WHERE reservation.inventory_stock_id=? AND reservation.status='ACTIVE'`).bind(issue.inventory_stock_id).first<{job_number:string;process_name:string;reel_number:string}>()
    if (reservation) return json({ error:`Reel ${reservation.reel_number} is currently reserved for Job ${reservation.job_number} / ${reservation.process_name}. It cannot be issued to a Customer.` },409)
    const stock = await db.prepare(`SELECT id,material_type,reel_number,reel_weight_kg FROM material_inventory_records
      WHERE id=? AND status='Available'`).bind(issue.inventory_stock_id).first<{id:number;material_type:string;reel_number:string;reel_weight_kg:number}>()
    const current = Number(stock?.reel_weight_kg)
    if (!stock || !(current>0)) return json({ error:'The selected material no longer has available stock.' },409)
    if (Math.abs(current-Number(issue.original_available_stock))>0.000001) return json({ error:`Available stock has changed. Current available stock is ${current} KG. Please review the Issue Quantity.` },409)
    const quantity = Number(issue.issue_quantity)
    if (!(quantity>0) || quantity>current) return json({ error:`Available stock has changed. Current available stock is ${current} KG. Please review the Issue Quantity.` },409)
    const remaining = current-quantity
    try {
      await db.batch([
        db.prepare(`INSERT INTO inventory_stock_ledger
          (transaction_type,reference_type,reference_id,reference_number,material_type,inventory_stock_id,
           movement,quantity,uom,previous_stock,revised_stock,reason,remarks,created_by_user_id,approved_by_user_id,
           zoho_customer_id,customer_name,zoho_invoice_id,invoice_number)
          VALUES ('MATERIAL_ISSUE','MATERIAL_ISSUE',?,?,?,?, 'OUT',?,'KG',?,?, 'Material supplied to Customer',?,?,?,?,?,?,?)`)
          .bind(id,issue.issue_number,stock.material_type,stock.id,quantity,current,remaining,
            `${issue.customer_name} | Invoice ${issue.invoice_number}`,user.id,user.id,issue.zoho_customer_id,
            issue.customer_name,issue.zoho_invoice_id,issue.invoice_number),
        db.prepare(`UPDATE inventory_material_issues SET status='COMPLETED',remaining_stock=?,completed_by_user_id=?,
          completed_by_name=?,completed_at=CURRENT_TIMESTAMP,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND status='DRAFT'`).bind(remaining,user.id,user.fullName,user.id,id),
      ])
    } catch (error) {
      console.error('[material-issues] completion failed',error)
      return json({ error:'Material Issue could not be completed because Inventory could not be updated. No stock changes were made.' },409)
    }
    return json({ success:true,id,status:'COMPLETED',remainingStock:remaining,...(await responseData(db,user)) })
  }

  const isExisting = Number.isInteger(id) && id>0
  if (!await permission(db,user,isExisting?'edit':'create')) return json({ error:'Material Issue create or edit access is required.' },403)
  const issueDate=text('issue_date'), customerId=text('zoho_customer_id'), materialType=text('material_type')
  const invoiceId=text('zoho_invoice_id'), invoiceNumber=text('invoice_number')
  const stockId=Number(body.inventory_stock_id), quantity=Number(body.issue_quantity)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)||!customerId||!invoiceId||!invoiceNumber||!materialType||!Number.isInteger(stockId)||stockId<=0||!(quantity>0))
    return json({ error:'Complete all mandatory Material Issue fields with valid values.' },400)
  const customer=await cachedCustomer(context.env,customerId)
  if (!customer) return json({ error:'Select a valid Customer from the cached Zoho Books customers.' },400)
  const invoiceValidation=await validateInvoice(context.env,invoiceId,invoiceNumber,customerId)
  if('error' in invoiceValidation) return json({ error:invoiceValidation.error },400)
  const stock=await db.prepare(`SELECT id,material_type,reel_weight_kg FROM material_inventory_records
    WHERE id=? AND status='Available' AND reel_weight_kg>0`).bind(stockId).first<{id:number;material_type:string;reel_weight_kg:number}>()
  if (!stock||stock.material_type!==materialType) return json({ error:'Select an available Inventory material.' },400)
  const reservation=await db.prepare(`SELECT job_number,process_name FROM inventory_reel_reservations
    WHERE inventory_stock_id=? AND status='ACTIVE'`).bind(stockId).first<{job_number:string;process_name:string}>()
  if (reservation) return json({ error:`This Reel is currently reserved for Job ${reservation.job_number} / ${reservation.process_name}. It cannot be issued to a Customer.` },409)
  const remaining=Number(stock.reel_weight_kg)-quantity
  if (remaining<0) return json({ error:`Issue Quantity cannot exceed available stock of ${stock.reel_weight_kg} KG.` },400)
  const values=[issueDate,customer.id,customer.name,materialType,stockId,stock.reel_weight_kg,quantity,remaining,
    invoiceId,invoiceNumber,text('sales_order_number')||null,text('customer_po_number')||null,text('remarks')||null]
  if (isExisting) {
    const existing=await db.prepare("SELECT status FROM inventory_material_issues WHERE id=?").bind(id).first<{status:string}>()
    if (!existing||existing.status!=='DRAFT') return json({ error:'Completed Material Issues are locked and cannot be edited.' },409)
    await db.prepare(`UPDATE inventory_material_issues SET issue_date=?,zoho_customer_id=?,customer_name=?,material_type=?,
      inventory_stock_id=?,original_available_stock=?,issue_quantity=?,remaining_stock=?,zoho_invoice_id=?,invoice_number=?,sales_order_number=?,
      customer_po_number=?,remarks=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='DRAFT'`)
      .bind(...values,user.id,id).run()
    return json({ success:true,id,status:'DRAFT',...(await responseData(db,user)) })
  }
  const inserted=await db.prepare(`INSERT INTO inventory_material_issues
    (issue_date,zoho_customer_id,customer_name,material_type,inventory_stock_id,original_available_stock,issue_quantity,
     remaining_stock,uom,zoho_invoice_id,invoice_number,sales_order_number,customer_po_number,remarks,status,issued_by_user_id,
     issued_by_name,updated_by_user_id) VALUES (?,?,?,?,?,?,?,?,'KG',?,?,?,?,?,'DRAFT',?,?,?)`)
    .bind(...values,user.id,user.fullName,user.id).run()
  return json({ success:true,id:Number(inserted.meta.last_row_id),status:'DRAFT',...(await responseData(db,user)) },201)
}
