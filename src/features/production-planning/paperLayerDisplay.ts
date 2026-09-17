/** Format a layer for display without changing its GSM or specification shade. */
export function formatLayerGsm(layer?: { gsm?: string | number | null; shade?: string | null }): string {
  const gsm = layer?.gsm == null ? '' : String(layer.gsm).trim()
  if (!gsm) return '—'
  const shade = layer?.shade?.trim().toLowerCase()
  const suffix = shade === 'gyt' ? 'G' : shade === 'natural' ? 'N' : ''
  return suffix ? `${gsm} ${suffix}` : gsm
}
