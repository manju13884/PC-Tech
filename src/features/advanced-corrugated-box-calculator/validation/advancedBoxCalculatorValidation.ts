import type { AdvancedNumericValue } from '../types/advancedBoxCalculatorTypes'

export function parseAdvancedNumericValue(value: string): AdvancedNumericValue {
  return value === '' ? '' : Number(value)
}

export function normalizeAdvancedNumber(value: AdvancedNumericValue): number {
  return value === '' ? 0 : Number(value)
}
