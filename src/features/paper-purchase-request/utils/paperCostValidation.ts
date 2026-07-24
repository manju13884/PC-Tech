import type { PaperCostInputs, PaperProductType } from '../types/paperPurchaseRequest'

export function validatePaperCostInputs(productType: PaperProductType, inputs: PaperCostInputs): string[] {
  const errors: string[] = []
  const requirePositive = (value: string, label: string) => {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) errors.push(`${label} must be greater than 0.`)
  }

  requirePositive(inputs.calculationQuantity, 'Calculation quantity')
  requirePositive(inputs.lengthMm, 'Length')
  requirePositive(inputs.breadthMm, 'Breadth')
  if (productType === 'BOX') requirePositive(inputs.heightMm, 'Height')
  if (!Number.isFinite(Number(inputs.wastagePercent)) || Number(inputs.wastagePercent) < 0) {
    errors.push('Wastage cannot be negative.')
  }
  inputs.layers.forEach((layer) => {
    requirePositive(layer.gsm, `${layer.label} GSM`)
    requirePositive(layer.drawRatio, `${layer.label} draw ratio`)
    if (!Number.isFinite(Number(layer.paperPricePerKg)) || Number(layer.paperPricePerKg) < 0) {
      errors.push(`${layer.label} paper price cannot be negative.`)
    }
  })
  return errors
}
