export type PaperProductType = 'BOX' | 'BOARD' | 'SHEET'

export interface EligiblePaperItem {
  name: string
  productType: PaperProductType
  defaultPly: number
}

export type EligibilityReason = 'eligible' | 'ten-ply' | 'roll' | 'not-approved'

export interface PaperItemEligibility {
  eligible: boolean
  reason: EligibilityReason
  configuration?: EligiblePaperItem
  message: string
}

export interface PaperLayerInput {
  key: string
  label: string
  paperType: string
  otherPaperType: string
  gsm: string
  bf: string
  paperPricePerKg: string
  drawRatio: string
}

export interface PaperCostInputs {
  calculationQuantity: string
  lengthMm: string
  breadthMm: string
  heightMm: string
  wastagePercent: string
  layers: PaperLayerInput[]
}

export interface PaperLayerResult {
  key: string
  label: string
  paperType: string
  gsm: number
  bf: number
  drawRatio: number
  paperPricePerKg: number
  baseWeightKg: number
  wastageWeightKg: number
  totalRequirementKg: number
  totalPaperCost: number
}

export interface PaperCostResult {
  productType: PaperProductType
  boxPly: number
  calculationQuantity: number
  lengthMm: number
  breadthMm: number
  heightMm?: number
  wastagePercent: number
  areaSqM: number
  sizeCm?: number
  deckleCm?: number
  layers: PaperLayerResult[]
  totalBaseWeightKg: number
  totalWastageWeightKg: number
  totalPaperRequirementKg: number
  totalPaperCost: number
  paperCostPerUnit: number
}
