export type AdvancedPaperWeightPly = 3 | 5

export type AdvancedPaperWeightLayerKey = 'top' | 'flute' | 'liner' | 'flute1' | 'liner1'

export interface AdvancedPaperWeightInput {
  ply: AdvancedPaperWeightPly
  lengthMm: number
  breadthMm: number
  heightMm: number
  quantity: number
  topGsm: number
  fluteGsm: number
  linerGsm: number
  flute1Gsm?: number
  liner1Gsm?: number
  topRatePerKg?: number
  fluteRatePerKg?: number
  linerRatePerKg?: number
  flute1RatePerKg?: number
  liner1RatePerKg?: number
}

export interface AdvancedPaperWeightLayerResult {
  key: AdvancedPaperWeightLayerKey
  label: string
  gsm: number
  drawRatio?: number
  ratePerKg: number | null
  weightPerBoxKg: number
  totalQuantityWeightKg: number
  totalPaperPrice: number | null
}

export interface AdvancedPaperWeightResult {
  sheetWidthCm: number
  sheetLengthCm: number
  sheetAreaSqM: number
  layerResults: AdvancedPaperWeightLayerResult[]
  totalBoxWeightKg: number
  groupedFluteWeightKg: number
  groupedLinerWeightKg: number
  grandTotalWeightKg: number
  totalPaperCost: number | null
}
