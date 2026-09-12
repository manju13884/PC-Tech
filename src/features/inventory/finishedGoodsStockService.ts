export interface FinishedGoodsRow{
  job_card_id:number;production_plan_line_id:number;zoho_sales_order_id:string;sales_order_number:string
  zoho_customer_id:string;customer_name:string;zoho_item_id:string;item_name:string;item_description:string
  polar_canvas_item_code:string|null;job_number:string;manufactured_date:string;manufactured_quantity:number;uom:string
}
export interface FinishedGoodsCustomer{customer_id:string;customer_name:string}
export interface FinishedGoodsResult{rows:FinishedGoodsRow[];customers:FinishedGoodsCustomer[]}

export async function loadFinishedGoodsStock(filters:Record<string,string>):Promise<FinishedGoodsResult>{
  const response=await fetch(`/api/finished-goods-stock?${new URLSearchParams(filters)}`,{credentials:'include'})
  const text=await response.text();let payload:unknown
  try{payload=text?JSON.parse(text):{}}catch{throw new Error('Finished Goods Stock service is unavailable. Please retry.')}
  if(!response.ok){const error=payload&&typeof payload==='object'?(payload as{error?:unknown}).error:null;throw new Error(typeof error==='string'?error:'Unable to load Finished Goods Stock.')}
  const value=payload as Partial<FinishedGoodsResult>
  return{rows:Array.isArray(value.rows)?value.rows:[],customers:Array.isArray(value.customers)?value.customers:[]}
}
