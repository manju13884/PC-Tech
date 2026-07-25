export interface PaperRequestHeaderRow {
  id: number
  request_number: string
  customer_id: string
  customer_name: string
  sales_order_id: string
  sales_order_number: string
  request_status: string
  requested_by_user_id: number
  requested_by_name: string | null
  requested_at: string
  approved_by_name: string | null
  approved_at: string | null
  rejection_reason: string | null
  rejected_by_name: string | null
  rejected_at: string | null
  resubmitted_at: string | null
  resubmission_count: number
}

export interface PaperRequestItemRow {
  id: number
  paper_request_id: number
  sales_order_item_id: string
  item_id: string
  item_name: string
  item_description: string | null
  ordered_quantity: number
  is_paper_eligible: number
  item_type: 'BOX' | 'BOARD' | 'SHEET' | 'NON_ELIGIBLE'
  length_mm: number | null
  breadth_mm: number | null
  height_mm: number | null
  box_ply: number | null
  calculation_quantity: number | null
  wastage_percent: number | null
  area_sq_m: number | null
  size_cm: number | null
  deckle_cm: number | null
  total_base_weight_kg: number | null
  total_wastage_weight_kg: number | null
  total_paper_requirement_kg: number | null
  total_paper_cost: number | null
  paper_cost_per_unit: number | null
}

export interface PaperRequestLayerRow {
  paper_request_item_id: number
  layer_key: string
  layer_name: string
  paper_type: string
  gsm: number
  bf: number
  deckle_cm: number | null
  cut_length_cm: number | null
  sheet_quantity: number
  paper_weight_kg: number
  wastage_factor: number
  total_paper_weight_kg: number
  paper_rate: number
  total_paper_cost: number
  draw_ratio: number
  wastage_weight_kg: number
}

export async function loadPaperRequestBySalesOrder(
  db: D1Database,
  salesOrderId: string,
): Promise<Record<string, unknown> | null> {
  const header = await db.prepare(
    `SELECT id, request_number, customer_id, customer_name, sales_order_id,
      sales_order_number, request_status, requested_by_user_id,
      requested_by_name, requested_at, approved_by_name, approved_at,
      rejection_reason, rejected_by_name, rejected_at, resubmitted_at,
      resubmission_count
    FROM paper_purchase_requests
    WHERE sales_order_id = ?
    LIMIT 1`,
  ).bind(salesOrderId).first<PaperRequestHeaderRow>()

  if (!header) return null

  const itemResult = await db.prepare(
    `SELECT id, paper_request_id, sales_order_item_id, item_id, item_name,
      item_description, ordered_quantity, is_paper_eligible, item_type,
      length_mm, breadth_mm, height_mm, box_ply, calculation_quantity,
      wastage_percent, area_sq_m, size_cm, deckle_cm, total_base_weight_kg,
      total_wastage_weight_kg, total_paper_requirement_kg, total_paper_cost,
      paper_cost_per_unit
    FROM paper_purchase_request_items
    WHERE paper_request_id = ?
    ORDER BY id`,
  ).bind(header.id).all<PaperRequestItemRow>()

  const items = itemResult.results
  const itemIds = items.map((item) => item.id)
  let layers: PaperRequestLayerRow[] = []
  if (itemIds.length > 0) {
    const placeholders = itemIds.map(() => '?').join(', ')
    const layerResult = await db.prepare(
      `SELECT paper_request_item_id, layer_key, layer_name, paper_type, gsm,
        bf, deckle_cm, cut_length_cm, sheet_quantity, paper_weight_kg,
        wastage_factor, total_paper_weight_kg, paper_rate, total_paper_cost,
        draw_ratio, wastage_weight_kg
      FROM paper_purchase_request_layers
      WHERE paper_request_item_id IN (${placeholders})
      ORDER BY id`,
    ).bind(...itemIds).all<PaperRequestLayerRow>()
    layers = layerResult.results
  }
  const historyResult = await db.prepare(
    `SELECT previous_status, new_status, action_type, action_reason,
      action_by_user_id, action_by_name, action_at
    FROM paper_purchase_request_history
    WHERE paper_request_id = ?
    ORDER BY action_at ASC, id ASC`,
  ).bind(header.id).all<{
    previous_status: string | null
    new_status: string
    action_type: string
    action_reason: string | null
    action_by_user_id: number
    action_by_name: string | null
    action_at: string
  }>()

  return {
    id: header.id,
    requestNumber: header.request_number,
    status: header.request_status,
    customerId: header.customer_id,
    customerName: header.customer_name,
    salesOrderId: header.sales_order_id,
    salesOrderNumber: header.sales_order_number,
    requestedByUserId: header.requested_by_user_id,
    requestedByName: header.requested_by_name,
    requestedAt: header.requested_at,
    approvedByName: header.approved_by_name,
    approvedAt: header.approved_at,
    rejectionReason: header.rejection_reason,
    rejectedByName: header.rejected_by_name,
    rejectedAt: header.rejected_at,
    resubmittedAt: header.resubmitted_at,
    resubmissionCount: header.resubmission_count,
    history: historyResult.results.map((entry) => ({
      previousStatus: entry.previous_status,
      newStatus: entry.new_status,
      actionType: entry.action_type,
      actionReason: entry.action_reason,
      actionByUserId: entry.action_by_user_id,
      actionByName: entry.action_by_name,
      actionAt: entry.action_at,
    })),
    items: items.map((item) => ({
      id: item.id,
      salesOrderItemId: item.sales_order_item_id,
      itemId: item.item_id,
      itemName: item.item_name,
      itemDescription: item.item_description ?? '',
      orderedQuantity: item.ordered_quantity,
      isPaperEligible: item.is_paper_eligible === 1,
      itemType: item.item_type,
      result: item.is_paper_eligible === 1 ? {
        productType: item.item_type,
        boxPly: item.box_ply,
        calculationQuantity: item.calculation_quantity,
        lengthMm: item.length_mm,
        breadthMm: item.breadth_mm,
        heightMm: item.height_mm ?? undefined,
        wastagePercent: item.wastage_percent,
        areaSqM: item.area_sq_m,
        sizeCm: item.size_cm ?? undefined,
        deckleCm: item.deckle_cm ?? undefined,
        totalBaseWeightKg: item.total_base_weight_kg,
        totalWastageWeightKg: item.total_wastage_weight_kg,
        totalPaperRequirementKg: item.total_paper_requirement_kg,
        totalPaperCost: item.total_paper_cost,
        paperCostPerUnit: item.paper_cost_per_unit,
        layers: layers.filter((layer) => layer.paper_request_item_id === item.id).map((layer) => ({
          key: layer.layer_key,
          label: layer.layer_name,
          paperType: layer.paper_type,
          gsm: layer.gsm,
          bf: layer.bf,
          drawRatio: layer.draw_ratio,
          paperPricePerKg: layer.paper_rate,
          baseWeightKg: layer.paper_weight_kg,
          wastageWeightKg: layer.wastage_weight_kg,
          totalRequirementKg: layer.total_paper_weight_kg,
          totalPaperCost: layer.total_paper_cost,
        })),
      } : null,
    })),
  }
}
