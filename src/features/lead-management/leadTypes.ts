export const leadStatuses = [
  'New',
  'Contacted',
  'Qualified',
  'Quotation',
  'On Hold',
  'Not Qualified',
  'Converted',
  'Closed',
] as const
export const leadSources = [
  'Cold Calling',
  'Email Campaign',
  'Website',
  'Referral',
  'Existing Customer Reference',
  'Exhibition / Event',
  'Direct Enquiry',
  'Other',
] as const
export const contactModes = ['Call', 'Email', 'WhatsApp', 'Visit', 'Meeting'] as const
export interface Lead {
  id: number
  lead_number: string
  company: string
  contact: string
  mobile: string
  email: string
  address: string
  city: string
  source: string
  product: string
  remarks: string
  coordinator_id: number | null
  coordinator_name: string | null
  status: string
  status_reason: string
  closure_reason: string
  customer_id: string | null
  last_contact_date: string | null
  next_follow_up_date: string | null
  created_at: string
  version: number
}
export interface Coordinator {
  id: number
  full_name: string
}
export interface LeadActivity {
  id: number
  contact_date: string
  mode: string
  discussion: string
  next_follow_up_date: string | null
  next_action: string
  user_name: string
  created_at: string
}
export interface LeadHistory {
  changes_json?: string | null
  id: number
  event: string
  previous_value: string | null
  new_value: string | null
  user_name: string
  changed_at: string
}

export const leadStatusReasonLabels: Record<string, string> = {
  Closed: 'Closure Reason',
  'On Hold': 'On Hold Reason',
  'Not Qualified': 'Not Qualified Reason',
}
