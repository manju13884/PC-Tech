import { calculateProductionDimensions } from '../calculators/blankSize.ts'

export interface ProductionMachineLine {
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  ply: number | null
  productType: string
  fluteRun: string
  ups: number | null
  deckleSize: string
  cutLengthCm: number | null
  restoredMachineSettings?: boolean
}

export const formatProductionDimension = (value: number | null) => value == null || !Number.isFinite(value)
  ? '' : value.toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 6 })

export function dimensionsForProductionLine(line: ProductionMachineLine, ups = line.ups) {
  if (!['BOX', 'RSC'].includes(line.productType.toUpperCase())) return null
  return calculateProductionDimensions({ lengthMm: line.lengthMm, breadthMm: line.widthMm,
    heightMm: line.heightMm, ply: line.ply, fluteRun: line.fluteRun, ups })
}

export function updateProductionUps<T extends ProductionMachineLine>(line: T, ups: number | null): T {
  const dimensions = dimensionsForProductionLine(line, ups)
  if (dimensions) return { ...line, ups, deckleSize: String(dimensions.deckleSizeCm), cutLengthCm: dimensions.cutLengthCm }
  // Unsupported products retain their existing manual machine-dimension workflow.
  // Invalid Ups must not leave an apparently valid calculated configuration behind.
  return dimensionsForProductionLine(line, 1)
    ? { ...line, ups, deckleSize: '', cutLengthCm: null } : { ...line, ups }
}

export function initializeProductionMachine<T extends ProductionMachineLine>(line: T, previous?: T): T {
  if (previous) {
    const sourceChanged = (['lengthMm', 'widthMm', 'heightMm', 'ply', 'fluteRun', 'productType'] as const)
      .some((key) => line[key] !== previous[key])
    if (sourceChanged) return updateProductionUps(line, previous.ups)
    return { ...line, fluteRun: previous.fluteRun, ups: previous.ups, deckleSize: previous.deckleSize, cutLengthCm: previous.cutLengthCm }
  }
  // Unplan/replan must first show the exact approved values, even if the specification changed.
  return line.restoredMachineSettings ? line : updateProductionUps(line, line.ups)
}
