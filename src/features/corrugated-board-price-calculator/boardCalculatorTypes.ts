export type BoardPly = 3 | 5 | 7

export type BoardLayerKey = 'top' | 'bf' | 'bl' | 'cf' | 'cl' | 'af' | 'al'

export type NumericInputValue = string

export interface BoardLayerInput {
  gsm: NumericInputValue
  burstingFactor: NumericInputValue
  paperRatePerKg: NumericInputValue
}

export type BoardLayerInputs = Record<BoardLayerKey, BoardLayerInput>

export interface BoardCalculatorState {
  boardPly: BoardPly
  lengthMm: NumericInputValue
  widthMm: NumericInputValue
  quantity: NumericInputValue
  layers: BoardLayerInputs
  conversionRatePerKg: NumericInputValue
  printingCostPerBoard: NumericInputValue
  transportCostPerBoard: NumericInputValue
  marginPercent: NumericInputValue
}

export type BoardCalculatorErrors = Record<string, string>

export interface BoardLayerCalculation {
  key: BoardLayerKey
  effectiveGsm: number
  rawWeightKg: number
  weightWithWastageKg: number
  paperCost: number
}

export interface BoardCalculationResult {
  boardAreaSqM: number
  layers: readonly BoardLayerCalculation[]
  rawBoardWeightKg: number
  boardWeightKg: number
  totalPaperCost: number
  conversionCost: number
  otherCosts: number
  totalCost: number
  markupAmount: number
  sellingPricePerBoard: number
  totalPaperWeight: number
  totalCostForQuantity: number
  totalSellingPrice: number
}
