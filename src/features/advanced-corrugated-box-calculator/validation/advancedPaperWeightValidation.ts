import type { AdvancedPaperWeightInput, AdvancedPaperWeightPly } from '../types/advancedPaperWeightTypes'

export interface AdvancedPaperWeightSourceValues {
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
  flute2Gsm?: number
  liner2Gsm?: number
}

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function validateAdvancedQuantity(value: string): string | null {
  if (value.trim() === '') return 'Total Box Quantity is required.'

  const quantity = Number(value)
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1) {
    return 'Enter a positive whole number of 1 or more.'
  }

  return null
}

export function validateAdvancedPaperWeightInput(
  values: AdvancedPaperWeightSourceValues,
): AdvancedPaperWeightInput | null {
  if (
    !Number.isInteger(values.quantity) ||
    values.quantity < 1 ||
    !isPositiveFinite(values.lengthMm) ||
    !isPositiveFinite(values.breadthMm) ||
    !isPositiveFinite(values.heightMm) ||
    !isPositiveFinite(values.topGsm) ||
    !isPositiveFinite(values.fluteGsm) ||
    !isPositiveFinite(values.linerGsm)
  ) {
    return null
  }

  if (values.ply === 5 && (!isPositiveFinite(values.flute1Gsm) || !isPositiveFinite(values.liner1Gsm))) {
    return null
  }

  if (values.ply === 7 && (
    !isPositiveFinite(values.flute1Gsm) || !isPositiveFinite(values.liner1Gsm) ||
    !isPositiveFinite(values.flute2Gsm) || !isPositiveFinite(values.liner2Gsm)
  )) return null

  return values as AdvancedPaperWeightInput
}
