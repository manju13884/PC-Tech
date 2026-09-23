import type { AuthenticatedUser } from './authenticatedUser'

export interface FinishedGoodsStock {
  job_card_id: number; production_plan_line_id: number; job_number: string; status: string
  customer_id: string; customer_name: string; sales_order_id: string; sales_order_number: string
  item_id: string; manufactured_quantity: number; dispatched_quantity: number; stock_adjustment: number
  closing_stock: number; uom: string
}

export async function fgAllowed(db: D1Database, user: AuthenticatedUser, action: 'view' | 'dispatch' | 'adjust' = 'view') {
  if (user.roleName === 'SUPERADMIN') return true
  const row = await db.prepare(`SELECT can_full,can_view,can_create,can_edit FROM role_menu_permissions WHERE role_id=? AND menu_key='finished-goods-stock'`).bind(user.roleId).first<{can_full:number;can_view:number;can_create:number;can_edit:number}>()
  return Boolean(row && (row.can_full === 1 || (row.can_view === 1 && (action === 'view' || (action === 'dispatch' ? row.can_create === 1 : row.can_edit === 1)))))
}

export async function fgStock(db: D1Database, id: number) {
  return db.prepare(`SELECT card.id AS job_card_id,card.job_number,card.status,card.manufactured_quantity,
    line.id AS production_plan_line_id,line.zoho_customer_id AS customer_id,line.customer_name,
    line.zoho_sales_order_id AS sales_order_id,line.sales_order_number,line.zoho_item_id AS item_id,line.uom,
    balance.dispatched_quantity,balance.stock_adjustment,balance.closing_stock
    FROM job_cards card JOIN production_plan_lines line ON line.id=card.production_plan_line_id
    JOIN production_plans plan ON plan.id=line.production_plan_id
    JOIN finished_goods_balances balance ON balance.job_card_id=card.id
    WHERE card.id=? AND plan.deleted_at IS NULL`).bind(id).first<FinishedGoodsStock>()
}

export const fgBalance = (row: FinishedGoodsStock) => ({
  manufactured_quantity: Number(row.manufactured_quantity),
  dispatched_quantity: Number(row.dispatched_quantity),
  stock_adjustment: Number(row.stock_adjustment),
  closing_stock: Number(row.closing_stock),
})
