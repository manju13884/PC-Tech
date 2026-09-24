export type BlankSizePly = 3 | 5 | 7

export const BLANK_SIZE_ALLOWANCES_MM = {
  boardCreasing: { 3: 3, 5: 6 },
  joint: 38,
  deckle: 20,
  // Preserve the existing combined allowance until 7-ply rules are confirmed.
  legacySevenPlyCutLength: 50,
} as const

export interface BlankSizeInput {
  length: number
  breadth: number
  height: number
  ply: BlankSizePly
}

export function calculateBlankSize({ length, breadth, height, ply }: BlankSizeInput) {
  const allowances = BLANK_SIZE_ALLOWANCES_MM
  const deckleSizeMm = breadth + height + allowances.deckle
  const cutLengthMm = ply === 7
    ? 2 * length + 2 * breadth + allowances.legacySevenPlyCutLength
    : 2 * (length + allowances.boardCreasing[ply])
      + 2 * (breadth + allowances.boardCreasing[ply]) + allowances.joint

  return {
    deckleSizeMm,
    cutLengthMm,
    deckleSizeCm: deckleSizeMm / 10,
    cutLengthCm: cutLengthMm / 10,
  }
}
