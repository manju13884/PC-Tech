// Keep this dropdown rule specific to SO Specification Mapping.
export function isMappableSalesOrder(order: { status?: string; order_status?: string }): boolean {
  // Zoho's overall status can be `invoiced` while its order_status is `closed`.
  const status = (order.order_status?.trim() || order.status?.trim())?.toLowerCase()
  return status !== 'closed' && status !== 'draft' && status !== 'void' && status !== 'voided'
}
