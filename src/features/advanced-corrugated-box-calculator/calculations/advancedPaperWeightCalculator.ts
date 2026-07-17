import { ADVANCED_PAPER_WEIGHT_CONSTANTS } from '../constants/advancedPaperWeightConstants'
import type {
  AdvancedPaperWeightInput,
  AdvancedPaperWeightLayerResult,
  AdvancedPaperWeightResult,
} from '../types/advancedPaperWeightTypes'

export function calculateAdvancedPaperWeight(input: AdvancedPaperWeightInput): AdvancedPaperWeightResult {
  const { drawRatioB, drawRatioC, drawRatioA, wastageFactor } = ADVANCED_PAPER_WEIGHT_CONSTANTS
  const sheetWidthCm = ((2 * input.lengthMm) + (2 * input.breadthMm) + 50) / 10
  const sheetLengthCm = (input.heightMm + input.breadthMm + 20) / 10
  const sheetAreaSqM = (sheetWidthCm / 100) * (sheetLengthCm / 100)

  const createLayer = (
    key: AdvancedPaperWeightLayerResult['key'],
    label: string,
    gsm: number,
    ratePerKg: number | undefined,
    drawRatio?: number,
  ): AdvancedPaperWeightLayerResult => {
    const weightPerBoxKg = sheetAreaSqM * (gsm / 1000) * (drawRatio ?? 1) * wastageFactor
    const validRate = typeof ratePerKg === 'number' && Number.isFinite(ratePerKg) && ratePerKg > 0
      ? ratePerKg
      : null
    const totalQuantityWeightKg = weightPerBoxKg * input.quantity
    return {
      key,
      label,
      gsm,
      drawRatio,
      ratePerKg: validRate,
      weightPerBoxKg,
      totalQuantityWeightKg,
      totalPaperPrice: validRate === null ? null : totalQuantityWeightKg * validRate,
    }
  }

  const layerResults: AdvancedPaperWeightLayerResult[] = [
    createLayer('top', 'Top', input.topGsm, input.topRatePerKg),
    createLayer('flute', 'Flute', input.fluteGsm, input.fluteRatePerKg, drawRatioB),
    createLayer('liner', 'Liner', input.linerGsm, input.linerRatePerKg),
  ]

  if (input.ply >= 5) {
    layerResults.push(
      createLayer('flute1', 'Flute 1', input.flute1Gsm as number, input.flute1RatePerKg, drawRatioC),
      createLayer('liner1', 'Liner 1', input.liner1Gsm as number, input.liner1RatePerKg),
    )
  }

  if (input.ply === 7) {
    layerResults.push(
      createLayer('flute2', 'AF', input.flute2Gsm as number, input.flute2RatePerKg, drawRatioA),
      createLayer('liner2', 'AL', input.liner2Gsm as number, input.liner2RatePerKg),
    )
  }

  const totalBoxWeightKg = layerResults.reduce((total, layer) => total + layer.weightPerBoxKg, 0)
  const groupedFluteWeightKg = layerResults
    .filter((layer) => layer.key === 'flute' || layer.key === 'flute1' || layer.key === 'flute2')
    .reduce((total, layer) => total + layer.totalQuantityWeightKg, 0)
  const groupedLinerWeightKg = layerResults
    .filter((layer) => layer.key === 'liner' || layer.key === 'liner1' || layer.key === 'liner2')
    .reduce((total, layer) => total + layer.totalQuantityWeightKg, 0)
  const hasValidRates = layerResults.every((layer) => layer.totalPaperPrice !== null)
  const totalPaperCost = hasValidRates
    ? layerResults.reduce((total, layer) => total + (layer.totalPaperPrice as number), 0)
    : null

  return {
    sheetWidthCm,
    sheetLengthCm,
    sheetAreaSqM,
    layerResults,
    totalBoxWeightKg,
    groupedFluteWeightKg,
    groupedLinerWeightKg,
    grandTotalWeightKg: totalBoxWeightKg * input.quantity,
    totalPaperCost,
  }
}
