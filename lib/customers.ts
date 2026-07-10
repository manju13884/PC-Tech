import { zohoGet, type ZohoEnv } from './zoho'

export interface ZohoContact {
  contact_id?: string | number
  contact_name?: string
  contact_type?: string
  gst_no?: string
  gstin?: string
  tax_id?: string
  tax_reg_no?: string
  status?: string
  is_active?: boolean
  active?: boolean
}

export interface CustomerSummary {
  customer_id: string
  customer_name: string
  gst_number: string
}

interface ZohoContactsResponse {
  contacts?: unknown[]
  data?: unknown[]
  page_context?: {
    has_more_page?: boolean
  }
}

const CONTACTS_PER_PAGE = 200

function buildContactsEndpoint(page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(CONTACTS_PER_PAGE),
  })

  return `/contacts?${params.toString()}`
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isActiveCustomer(contact: ZohoContact): boolean {
  const contactType = normalizeText(contact.contact_type).toLowerCase()
  if (contactType && contactType !== 'customer') {
    return false
  }

  const status = normalizeText(contact.status).toLowerCase()
  if (status && status !== 'active') {
    return false
  }

  if (typeof contact.is_active === 'boolean' && !contact.is_active) {
    return false
  }

  if (typeof contact.active === 'boolean' && !contact.active) {
    return false
  }

  return true
}

function mapContactToCustomer(contact: ZohoContact): CustomerSummary | null {
  const customerId = contact.contact_id != null ? String(contact.contact_id) : ''
  const customerName = normalizeText(contact.contact_name)
  const gstNumber =
    normalizeText(contact.gst_no) ||
    normalizeText(contact.gstin) ||
    normalizeText(contact.tax_id) ||
    normalizeText(contact.tax_reg_no)

  if (!customerId || !customerName) {
    return null
  }

  return {
    customer_id: customerId,
    customer_name: customerName,
    gst_number: gstNumber,
  }
}

export async function getZohoCustomers(env?: ZohoEnv): Promise<CustomerSummary[]> {
  const contacts: unknown[] = []
  let page = 1
  let hasMorePage = true

  while (hasMorePage) {
    const payload = await zohoGet(buildContactsEndpoint(page), env)

    if (!payload || typeof payload !== 'object') {
      break
    }

    const responsePayload = payload as ZohoContactsResponse
    const pageContacts = Array.isArray(responsePayload.contacts)
      ? responsePayload.contacts
      : Array.isArray(responsePayload.data)
        ? responsePayload.data
        : []

    contacts.push(...pageContacts)
    hasMorePage = responsePayload.page_context?.has_more_page ?? pageContacts.length === CONTACTS_PER_PAGE
    page += 1
  }

  return contacts
    .filter((item): item is ZohoContact => Boolean(item) && typeof item === 'object')
    .filter(isActiveCustomer)
    .map(mapContactToCustomer)
    .filter((item): item is CustomerSummary => item !== null)
}
