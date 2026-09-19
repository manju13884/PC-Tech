export function calculatedCutLengthCm(lengthMm: number | null, widthMm: number | null): number | null {
  if (lengthMm == null) return null
  const cutLengthMm = widthMm == null ? lengthMm : (2 * lengthMm) + (2 * widthMm) + 50
  return cutLengthMm > 0 ? cutLengthMm / 10 : null
}

export function formatCutLengthExpression(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—'
  return `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 3 })} + 1`
}
