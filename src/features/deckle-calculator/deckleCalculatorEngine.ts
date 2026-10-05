import { BLANK_SIZE_ALLOWANCES_MM, calculateCutLengthBreakdown, calculateProductionDimensions, type BlankSizePly } from '../calculators/blankSize.ts'

export interface DeckleInput {
  lengthMm: number
  widthMm: number
  heightMm: number
  ply: BlankSizePly
  fluteRun: string
  orientation?: string
}
export interface DeckleOption {
  orientation: string
  ups: number
  deckleCm: number
  cutLengthCm: number
  unusedCm: number | null
  utilization: number | null
  status: 'FITS' | 'EXCEEDS'
  allowanceMm: number
}
export const APPROVED_DECKLE_ORIENTATION = 'Ups across deckle'

export function calculateDeckleForUps(box: DeckleInput, ups: number) {
  if (box.orientation && box.orientation !== APPROVED_DECKLE_ORIENTATION) return null
  return calculateProductionDimensions({ lengthMm: box.lengthMm, breadthMm: box.widthMm,
    heightMm: box.heightMm, ply: box.ply, fluteRun: box.fluteRun, ups })
}

export function evaluateDeckleOptions(box: DeckleInput, maximumCm: number | null) {
  if (maximumCm == null || !Number.isFinite(maximumCm) || maximumCm <= 0) {
    throw new Error('Maximum Machine Deckle is not configured. Configure it under Configurations → Master Data.')
  }
  if (![box.lengthMm, box.widthMm, box.heightMm].every(v => Number.isFinite(v) && v > 0)) {
    throw new Error('Enter valid Length, Width and Height greater than zero in MM.')
  }
  const single = calculateDeckleForUps(box, 1)
  if (!single) throw new Error('INVALID ORIENTATION: use the approved Ups across deckle layout and 3, 5 or 7 ply.')
  // Protect the browser from pathological inputs without silently truncating the analysis.
  const count = Math.floor((maximumCm * 10 - BLANK_SIZE_ALLOWANCES_MM.multiUpDeckle) / (box.widthMm + box.heightMm))
  if (!Number.isSafeInteger(count) || count > 100000) throw new Error('These dimensions require too many candidates to display. Check the dimensions and machine configuration units.')
  const options: DeckleOption[] = []
  let recommended: DeckleOption | null = null
  for (let ups = 1; ; ups++) {
    const dimensions = calculateDeckleForUps(box, ups)!
    const fits = dimensions.deckleSizeCm <= maximumCm + 1e-9
    const option: DeckleOption = {
      orientation: APPROVED_DECKLE_ORIENTATION, ups, deckleCm: dimensions.deckleSizeCm,
      cutLengthCm: dimensions.cutLengthCm, status: fits ? 'FITS' : 'EXCEEDS',
      unusedCm: fits ? Math.max(0, maximumCm - dimensions.deckleSizeCm) : null,
      utilization: fits ? Math.min(100, dimensions.deckleSizeCm / maximumCm * 100) : null,
      allowanceMm: ups === 1 ? BLANK_SIZE_ALLOWANCES_MM.deckle : BLANK_SIZE_ALLOWANCES_MM.multiUpDeckle,
    }
    options.push(option)
    if (fits && (!recommended || option.deckleCm > recommended.deckleCm
      || (option.deckleCm === recommended.deckleCm && ups > recommended.ups))) recommended = option
    // 1-Up and multi-Up have different trim rules. Check 2-Up even when 1-Up fails;
    // after that the shared formula grows monotonically with positive W + H.
    if (!fits && ups >= 2) break
  }
  const minimum = options.reduce((a, b) => a.deckleCm < b.deckleCm ? a : b)
  return { box, maximumCm, single, options, recommended, minimum,
    explanation: {
      cutLength: calculateCutLengthBreakdown({ length: box.lengthMm, breadth: box.widthMm, height: box.heightMm, ply: box.ply }),
      deckleSideMm: box.widthMm + box.heightMm,
      singleTrimMm: BLANK_SIZE_ALLOWANCES_MM.deckle,
      multiTrimMm: BLANK_SIZE_ALLOWANCES_MM.multiUpDeckle,
    },
  }
}
