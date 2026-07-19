import type { BoardLayerKey, BoardPly } from './boardCalculatorTypes'

export const BOARD_PLY_LAYER_CONFIG: Readonly<Record<BoardPly, readonly BoardLayerKey[]>> = Object.freeze({
  3: Object.freeze(['top', 'bf', 'bl'] as const),
  5: Object.freeze(['top', 'bf', 'bl', 'cf', 'cl'] as const),
  7: Object.freeze(['top', 'bf', 'bl', 'cf', 'cl', 'af', 'al'] as const),
})

export const BOARD_LAYER_LABELS: Readonly<Record<BoardLayerKey, string>> = Object.freeze({
  top: 'Top',
  bf: 'BF',
  bl: 'BL',
  cf: 'CF',
  cl: 'CL',
  af: 'AF',
  al: 'AL',
})

export const ALL_BOARD_LAYER_KEYS = Object.freeze([
  'top', 'bf', 'bl', 'cf', 'cl', 'af', 'al',
] as const satisfies readonly BoardLayerKey[])

// Copied from the working Box Price Calculator. These intentionally differ
// from the Advanced Paper Requirement ratios (B 1.36 / C 1.43).
export const BOARD_FLUTE_DRAW_RATIOS: Readonly<Partial<Record<BoardLayerKey, number>>> = Object.freeze({
  bf: 1.35,
  cf: 1.45,
  af: 1.45,
})

export const BOARD_WASTAGE_FACTOR = 1.05 as const
export const BOARD_DEFAULT_PAPER_RATE = 33 as const
export const BOARD_DEFAULT_CONVERSION_RATE_PER_KG = 10 as const
export const BOARD_DEFAULT_MARKUP_PERCENT = 5 as const
