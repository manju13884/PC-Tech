export function parseProductionUps(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const ups = Number(value)
  return Number.isSafeInteger(ups) && ups > 0 ? ups : null
}
