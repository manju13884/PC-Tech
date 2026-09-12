import { getAuthenticatedUser } from '../lib/authenticatedUser'

interface Env { DB?: D1Database }
interface Context { request: Request; env: Env }
const json=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store'}})

async function canView(db:D1Database,roleId:number,roleName:string){
  if(roleName==='SUPERADMIN')return true
  return Boolean(await db.prepare(`SELECT 1 FROM role_menu_permissions WHERE role_id=? AND menu_key='finished-goods-stock' AND (can_full=1 OR can_view=1)`).bind(roleId).first())
}

export async function onRequestGet(context:Context):Promise<Response>{
 try{
  const db=context.env.DB
  if(!db)return json({error:'Finished Goods Stock database is unavailable.'},503)
  const user=await getAuthenticatedUser(context.request,db)
  if(!user)return json({error:'Authentication required.'},401)
  if(!await canView(db,user.roleId,user.roleName))return json({error:'Finished Goods Stock view access is required.'},403)

  const url=new URL(context.request.url)
  const from=url.searchParams.get('from_date')?.trim()||''
  const to=url.searchParams.get('to_date')?.trim()||''
  if((from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))||(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to)))return json({error:'Enter valid From and To dates.'},400)
  const clauses=['card.manufactured_quantity > 0','plan.deleted_at IS NULL']
  const values:unknown[]=[]
  const manufacturedAt=`COALESCE(
    (SELECT MAX(entry.completed_at) FROM job_card_process_entries entry WHERE entry.job_card_id=card.id AND entry.process_status='COMPLETED'),
    card.updated_at,plan.plan_date,card.created_at)`
  if(from){clauses.push(`date(${manufacturedAt},'+5 hours','+30 minutes')>=?`);values.push(from)}
  if(to){clauses.push(`date(${manufacturedAt},'+5 hours','+30 minutes')<=?`);values.push(to)}
  const filters:[string,string][]=[['customer_id','line.zoho_customer_id=?'],['sales_order','line.sales_order_number LIKE ?'],['job_card','card.job_number LIKE ?'],['item','(line.item_name LIKE ? OR line.item_description LIKE ? OR spec.polar_canvas_item_code LIKE ?)']]
  for(const[key,clause]of filters){const value=url.searchParams.get(key)?.trim();if(!value)continue;clauses.push(clause);const bound=key==='customer_id'?value:`%${value}%`;values.push(...(key==='item'?[bound,bound,bound]:[bound]))}

  const reportSql=`SELECT card.id AS job_card_id,line.id AS production_plan_line_id,line.zoho_sales_order_id,
    line.sales_order_number,line.zoho_customer_id,line.customer_name,line.zoho_item_id,line.item_name,
    line.item_description,spec.polar_canvas_item_code,card.job_number,${manufacturedAt} AS manufactured_date,
    card.manufactured_quantity,line.uom
    FROM job_cards card
    INNER JOIN production_plan_lines line ON line.id=card.production_plan_line_id
    INNER JOIN production_plans plan ON plan.id=line.production_plan_id
    LEFT JOIN product_specification_records spec ON spec.id=line.approved_specification_revision_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY manufactured_date DESC,card.id DESC LIMIT 5000`
  const reportStatement=db.prepare(reportSql)
  const rows=values.length?await reportStatement.bind(...values).all():await reportStatement.all()
  const customers=await db.prepare(`SELECT DISTINCT line.zoho_customer_id AS customer_id,line.customer_name
    FROM job_cards card INNER JOIN production_plan_lines line ON line.id=card.production_plan_line_id
    INNER JOIN production_plans plan ON plan.id=line.production_plan_id
    WHERE card.manufactured_quantity>0 AND plan.deleted_at IS NULL ORDER BY line.customer_name`).all()
  return json({rows:rows.results??[],customers:customers.results??[]})
 }catch(error){
  console.error('[finished-goods-stock] load failed',error)
  return json({error:'Unable to load Finished Goods Stock. Please retry.'},500)
 }
}
