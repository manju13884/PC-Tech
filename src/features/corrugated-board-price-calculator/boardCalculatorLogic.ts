import {
  ALL_BOARD_LAYER_KEYS,
  BOARD_DEFAULT_CONVERSION_RATE_PER_KG,
  BOARD_DEFAULT_MARKUP_PERCENT,
  BOARD_DEFAULT_PAPER_RATE,
  BOARD_FLUTE_DRAW_RATIOS,
  BOARD_PLY_LAYER_CONFIG,
  BOARD_WASTAGE_FACTOR,
} from './boardCalculatorConfig'
import type {
  BoardCalculationResult,
  BoardCalculatorErrors,
  BoardCalculatorState,
  BoardLayerInputs,
  BoardPly,
} from './boardCalculatorTypes'

const emptyLayer = () => ({ gsm: '', burstingFactor: '', paperRatePerKg: String(BOARD_DEFAULT_PAPER_RATE) })

export const createInitialBoardCalculatorState = (): BoardCalculatorState => ({
  boardPly: 3,
  lengthMm: '',
  widthMm: '',
  quantity: '',
  layers: ALL_BOARD_LAYER_KEYS.reduce<BoardLayerInputs>((layers, key) => {
    layers[key] = emptyLayer()
    layers[key].gsm = '120'
    layers[key].burstingFactor = '16'
    return layers
  }, {} as BoardLayerInputs),
  conversionRatePerKg: String(BOARD_DEFAULT_CONVERSION_RATE_PER_KG),
  printingCostPerBoard: '',
  transportCostPerBoard: '',
  marginPercent: String(BOARD_DEFAULT_MARKUP_PERCENT),
})

export const getActiveBoardLayerKeys = (boardPly: BoardPly) => BOARD_PLY_LAYER_CONFIG[boardPly]

const requirePositive = (value: string, label: string) => {
  const parsed = Number(value)
  return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0 ? '' : `${label} must be greater than 0.`
}

const validateOptionalNonNegative = (value: string, label: string) => {
  if (value.trim() === '') return ''
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? '' : `${label} cannot be negative.`
}

export const validateBoardCalculator = (state: BoardCalculatorState): BoardCalculatorErrors => {
  const errors: BoardCalculatorErrors = {}
  const requiredFields = [
    ['lengthMm', state.lengthMm, 'Length'],
    ['widthMm', state.widthMm, 'Width / Deckle'],
    ['quantity', state.quantity, 'Quantity'],
  ] as const

  requiredFields.forEach(([key, value, label]) => {
    const error = requirePositive(value, label)
    if (error) errors[key] = error
  })

  getActiveBoardLayerKeys(state.boardPly).forEach((key) => {
    const gsmError = requirePositive(state.layers[key].gsm, `${key.toUpperCase()} GSM`)
    if (gsmError) errors[`layers.${key}.gsm`] = gsmError
    const rateError = requirePositive(state.layers[key].paperRatePerKg, `${key.toUpperCase()} paper rate`)
    if (rateError) errors[`layers.${key}.paperRatePerKg`] = rateError
    const bfError = validateOptionalNonNegative(state.layers[key].burstingFactor, `${key.toUpperCase()} BF`)
    if (bfError) errors[`layers.${key}.burstingFactor`] = bfError
  })

  ;([
    ['conversionRatePerKg', state.conversionRatePerKg, 'Conversion rate'],
    ['printingCostPerBoard', state.printingCostPerBoard, 'Printing cost'],
    ['transportCostPerBoard', state.transportCostPerBoard, 'Transport cost'],
    ['marginPercent', state.marginPercent, 'Margin'],
  ] as const).forEach(([key, value, label]) => {
    const error = validateOptionalNonNegative(value, label)
    if (error) errors[key] = error
  })

  return errors
}

export const ceilBoardValueToThreeDecimals = (value: number) => Math.ceil(value * 1000) / 1000

export const calculateCorrugatedBoardPrice = (state: BoardCalculatorState): BoardCalculationResult | null => {
  if (Object.keys(validateBoardCalculator(state)).length > 0) return null

  const boardAreaSqM = (Number(state.lengthMm) * Number(state.widthMm)) / 1_000_000
  const layers = getActiveBoardLayerKeys(state.boardPly).map((key) => {
    const enteredGsm = Number(state.layers[key].gsm)
    const effectiveGsm = enteredGsm * (BOARD_FLUTE_DRAW_RATIOS[key] ?? 1)
    const rawWeightKg = boardAreaSqM * (effectiveGsm / 1000)
    // The source calculator rounds each wastage-inclusive layer weight upward
    // before using it for paper cost and board-weight totals.
    const weightWithWastageKg = ceilBoardValueToThreeDecimals(rawWeightKg * BOARD_WASTAGE_FACTOR)
    const paperCost = ceilBoardValueToThreeDecimals(
      weightWithWastageKg * Number(state.layers[key].paperRatePerKg),
    )
    return { key, effectiveGsm, rawWeightKg, weightWithWastageKg, paperCost }
  })

  const rawBoardWeightKg = layers.reduce((total, layer) => total + layer.rawWeightKg, 0)
  const boardWeightKg = ceilBoardValueToThreeDecimals(
    layers.reduce((total, layer) => total + layer.weightWithWastageKg, 0),
  )
  const totalPaperCost = layers.reduce((total, layer) => total + layer.paperCost, 0)
  const conversionCost = boardWeightKg * Number(state.conversionRatePerKg)
  const otherCosts = Number(state.printingCostPerBoard || 0) + Number(state.transportCostPerBoard || 0)
  const totalCost = ceilBoardValueToThreeDecimals(totalPaperCost + conversionCost + otherCosts)
  const markupAmount = ceilBoardValueToThreeDecimals(totalCost * (Number(state.marginPercent) / 100))
  const sellingPricePerBoard = ceilBoardValueToThreeDecimals(totalCost + markupAmount)
  const quantity = Number(state.quantity)

  return {
    boardAreaSqM,
    layers,
    rawBoardWeightKg,
    boardWeightKg,
    totalPaperCost,
    conversionCost,
    otherCosts,
    totalCost,
    markupAmount,
    sellingPricePerBoard,
    totalPaperWeight: boardWeightKg * quantity,
    totalCostForQuantity: totalCost * quantity,
    totalSellingPrice: sellingPricePerBoard * quantity,
  }
}
