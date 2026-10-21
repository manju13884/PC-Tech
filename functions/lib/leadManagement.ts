import type { AuthenticatedUser } from './authenticatedUser'
import { leadSources } from '../../src/features/lead-management/leadTypes'
export const leadAdmin = (user: AuthenticatedUser) =>
  ['SUPERADMIN', 'ADMIN'].includes(user.roleName)
export function leadScope(user: AuthenticatedUser, alias = 'l', viewAll = false) {
  return leadAdmin(user) || viewAll
    ? { sql: '1=1', values: [] as number[] }
    : { sql: `${alias}.coordinator_id=?`, values: [user.id] }
}
export async function leadPermissions(db: D1Database, user: AuthenticatedUser) {
  if (user.roleName === 'SUPERADMIN') return { view: true, create: true, edit: true, reassign: true, viewAll: true }
  const p = await db
    .prepare(
      "SELECT can_full,can_view,can_create,can_edit,EXISTS(SELECT 1 FROM user_special_permissions WHERE user_id=? AND permission_key='lead-management:reassign' AND granted=1) AS can_reassign,EXISTS(SELECT 1 FROM user_special_permissions WHERE user_id=? AND permission_key='lead-management:view-all' AND granted=1) AS can_view_all FROM role_menu_permissions WHERE role_id=? AND menu_key='lead-management'",
    )
    .bind(user.id, user.id, user.roleId)
    .first<{ can_full: number; can_view: number; can_create: number; can_edit: number; can_reassign: number; can_view_all: number }>()
  const operationalRole = ['ADMIN', 'SALES'].includes(user.roleName)
  if (!operationalRole && p?.can_view_all !== 1)
    return { view: false, create: false, edit: false, reassign: false, viewAll: false }
  const view = Boolean(p && (p.can_full === 1 || p.can_view === 1))
  return {
    view,
    viewAll: view && (leadAdmin(user) || p?.can_view_all === 1),
    create: view && operationalRole && Boolean(p && (p.can_full === 1 || p.can_create === 1)),
    edit: view && (p?.can_view_all === 1 || (operationalRole && Boolean(p && (p.can_full === 1 || p.can_edit === 1)))),
    reassign: view && (p?.can_view_all === 1 || (operationalRole && Boolean(p && (p.can_full === 1 || p.can_edit === 1)) && (leadAdmin(user) || p?.can_reassign === 1))),
  }
}
export function leadFields(body: Record<string, unknown>) {
  const fields = Object.fromEntries(
    ['company', 'contact', 'mobile', 'email', 'city', 'address', 'source', 'product', 'remarks'].map((k) => [
      k,
      String(body[k] ?? '').trim(),
    ]),
  )
  if (Object.values(fields).some((v) => v.length > 2000))
    throw new Error('Fields cannot exceed 2,000 characters.')
  if (!fields.company || !fields.city)
    throw new Error('Company and city are required.')
  if (!fields.mobile && !fields.email) throw new Error('Mobile or email is required.')
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))
    throw new Error('Enter a valid email address.')
  if (!leadSources.some((v) => v === fields.source)) throw new Error('Select a valid lead source.')
  return fields
}
export function validLeadDate(value: unknown, required = false) {
  const s = String(value ?? '')
  if (!s && !required) return null
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw new Error('Enter a valid date.')
  return s
}
const phoneSql = (column: string) =>
  [' ', '-', '+', '(', ')', '.'].reduce(
    (sql, character) => `replace(${sql},'${character}','')`,
    column,
  )
export const duplicatePredicate = `(lower(trim(company))=lower(?) OR (?!='' AND lower(email)=lower(?)) OR (?!='' AND EXISTS (SELECT 1 FROM json_each('[' || replace(json_quote(${phoneSql('mobile')}), ',', '","') || ']') stored JOIN json_each('[' || replace(json_quote(${phoneSql('?')}), ',', '","') || ']') incoming ON stored.value=incoming.value WHERE stored.value!='')))`
export const duplicateValues = (f: Record<string, string>) => [
  f.company,
  f.email,
  f.email,
  f.mobile,
  f.mobile,
]
