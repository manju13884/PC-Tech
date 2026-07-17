export type AdvancedNumericValue = number | ''

export type ProductionBoxPly = 3 | 5 | 7

export type ProductionLayerKey =
  | 'top' | 'bFlute' | 'bLiner' | 'cFlute' | 'cLiner' | 'aFlute' | 'aLiner'

export const PRODUCTION_PLY_LAYER_CONFIG: Record<ProductionBoxPly, readonly ProductionLayerKey[]> = {
  3: ['top', 'bFlute', 'bLiner'],
  5: ['top', 'bFlute', 'bLiner', 'cFlute', 'cLiner'],
  7: ['top', 'bFlute', 'bLiner', 'cFlute', 'cLiner', 'aFlute', 'aLiner'],
}
