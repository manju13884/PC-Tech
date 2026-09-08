const FLUTE_DRAW_RATIOS: Record<string, number> = {
  A: 1.45,
  B: 1.36,
  C: 1.43,
  E: 1.225,
  F: 1.2,
}

export function calculateRequiredPaperQuantity(
  deckleMm: number,
  rotaryMm: number,
  gsmValue: string | number | undefined,
  boxQuantity: number,
  flute?: string,
): number | null {
  const gsm = Number(gsmValue)
  if (![deckleMm, rotaryMm, gsm, boxQuantity].every((value) => Number.isFinite(value) && value > 0)) return null
  const drawRatio = flute ? FLUTE_DRAW_RATIOS[flute.trim().toUpperCase()] ?? 1 : 1
  return (deckleMm * rotaryMm * gsm * boxQuantity * drawRatio * 1.05) / 1_000_000_000
}
