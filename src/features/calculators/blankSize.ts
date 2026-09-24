export type BlankSizePly = 3 | 5 | 7

export interface ManufacturingAllowances {
  boardCreasing: { 3: number; 5: number }
  joint: number
  deckle: number
  multiUpDeckle: number
  legacySevenPlyCutLength: number
}

export const BLANK_SIZE_ALLOWANCES_MM: ManufacturingAllowances = {
  boardCreasing: { 3: 3, 5: 6 },
  joint: 38,
  deckle: 20,
  // One overall trim allowance for multiple blanks across the production deckle.
  multiUpDeckle: 10,
  // Preserve the existing combined allowance until 7-ply rules are confirmed.
  legacySevenPlyCutLength: 50,
} as const

export interface BlankSizeInput {
  length: number
  breadth: number
  height: number
  ply: BlankSizePly
}

export function calculateBlankSize({ length, breadth, height, ply }: BlankSizeInput, allowances = BLANK_SIZE_ALLOWANCES_MM) {
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

export interface ProductionDimensionInput {
  lengthMm: number | null
  breadthMm: number | null
  heightMm: number | null
  ply: number | null
  fluteRun: string
  ups: number | null
}

export function calculateProductionDimensions(input: ProductionDimensionInput, allowances = BLANK_SIZE_ALLOWANCES_MM) {
  const { lengthMm, breadthMm, heightMm, ply, ups } = input
  if (lengthMm == null || breadthMm == null || heightMm == null || ups == null
    || ![lengthMm, breadthMm, heightMm].every((value) => Number.isFinite(value) && value > 0)
    || !Number.isSafeInteger(ups) || ups <= 0 || (ply !== 3 && ply !== 5 && ply !== 7)) return null
  const blank = calculateBlankSize({ length: lengthMm, breadth: breadthMm, height: heightMm, ply }, allowances)
  // Current approved orientation places Ups across deckle, for every flute run.
  // Cut length is the same shared single-blank calculation, never multiplied by Ups.
  const deckleSizeMm = ups === 1 ? blank.deckleSizeMm : (breadthMm + heightMm) * ups + allowances.multiUpDeckle
  if (!Number.isFinite(deckleSizeMm) || !Number.isFinite(blank.cutLengthCm)) return null
  return { deckleSizeCm: deckleSizeMm / 10, cutLengthCm: blank.cutLengthCm }
}
