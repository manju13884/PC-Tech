export interface LeadFieldChange { field: string; previous: string | null; current: string | null }
export interface LeadChangeDetails { action: string; changes: LeadFieldChange[] }
export const leadHistoryActionLabels: Record<string, string> = {
  edit: 'Lead details updated', status: 'Status updated', followup: 'Follow-up recorded',
  reassign: 'Coordinator reassigned', convert: 'Converted to customer',
}
export const leadHistoryFieldLabels: Record<string, string> = {
  company: 'Company / Lead Name', contact: 'Contact Person', mobile: 'Mobile Number', email: 'Email Address',
  city: 'Location / City', address: 'Address', source: 'Lead Source', product: 'Product Interested',
  remarks: 'Remarks', coordinator_id: 'Sales Coordinator', status: 'Lead Status', status_reason: 'Status Reason',
  customer_id: 'Customer ID', last_contact_date: 'Last Contact Date', next_follow_up_date: 'Next Follow-up Date',
  contact_date: 'Contact Date', contact_mode: 'Contact Mode', discussion: 'Discussion', next_action: 'Next Action',
}
export function parseLeadChangeDetails(value?: string | null): LeadChangeDetails | null {
  if (!value) return null
  try {
    const data = JSON.parse(value)
    if (!data || typeof data.action !== 'string' || !Array.isArray(data.changes)) return null
    if (!data.changes.every((entry: LeadFieldChange) => entry && typeof entry.field === 'string' &&
      (entry.previous === null || typeof entry.previous === 'string') && (entry.current === null || typeof entry.current === 'string'))) return null
    return data
  } catch { return null }
}
