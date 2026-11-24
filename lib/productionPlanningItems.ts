export const PRODUCTION_ITEMS_KEY = 'production-planning-item-ids'

export async function readProductionPlanningItems(db: D1Database): Promise<Set<string>> {
  const row = await db.prepare('SELECT value FROM master_data WHERE key = ?').bind(PRODUCTION_ITEMS_KEY).first<{ value: string }>()
  if (!row) return new Set()
  const value: unknown = JSON.parse(row.value)
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string' && id.trim())) throw new Error('Invalid production item selection')
  return new Set(value)
}
