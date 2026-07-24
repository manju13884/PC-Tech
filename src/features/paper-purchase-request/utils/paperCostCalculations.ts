import type {
  PaperCostInputs,
  PaperCostResult,
  PaperLayerInput,
  PaperProductType,
} from '../types/paperPurchaseRequest'

const DRAW_RATIOS = [1.36, 1.43, 1.45, 1.45] as const

export function createPaperLayers(ply: number): PaperLayerInput[] {
  let fluteIndex = 0
  return Array.from({ length: ply }, (_, index) => {
    const isFlute = index % 2 === 1
    const fluteNumber = fluteIndex + 1
    const label = index === 0
      ? 'Top Liner'
      : isFlute
        ? fluteNumber === 1 ? 'Flute' : `Flute ${fluteNumber - 1}`
        : index === 2 ? 'Inner Liner' : `Liner ${Math.ceil(index / 2) - 1}`
    const drawRatio = isFlute ? DRAW_RATIOS[Math.min(fluteIndex++, DRAW_RATIOS.length - 1)] : 1
    return {
      key: `layer-${index + 1}`,
      label,
      paperType: 'Natural',
      otherPaperType: '',
      gsm: '120',
      bf: '16',
      paperPricePerKg: '33',
      drawRatio: String(drawRatio),
    }
  })
}

export function createInitialPaperCostInputs(ply: number, salesOrderQuantity: number): PaperCostInputs {
  return {
    calculationQuantity: salesOrderQuantity > 0 ? String(salesOrderQuantity) : '',
    lengthMm: '',
    breadthMm: '',
    heightMm: '',
    wastagePercent: '5',
    layers: createPaperLayers(ply),
  }
}

export function calculatePaperCost(
  productType: PaperProductType,
  inputs: PaperCostInputs,
): PaperCostResult | null {
  const quantity = Number(inputs.calculationQuantity)
  const length = Number(inputs.lengthMm)
  const breadth = Number(inputs.breadthMm)
  const height = Number(inputs.heightMm)
  const wastagePercent = Number(inputs.wastagePercent)

  if (!(quantity > 0) || !(length > 0) || !(breadth > 0)
    || (productType === 'BOX' && !(height > 0))
    || !Number.isFinite(wastagePercent) || wastagePercent < 0) {
    return null
  }

  // Isolated copies of the approved calculators' geometry:
  // Box: Advanced Paper Requirement developed sheet; Board/Sheet: flat board area.
  const sizeCm = productType === 'BOX' ? ((2 * length) + (2 * breadth) + 50) / 10 : undefined
  const deckleCm = productType === 'BOX' ? (height + breadth + 20) / 10 : undefined
  const areaSqM = productType === 'BOX'
    ? ((sizeCm as number) / 100) * ((deckleCm as number) / 100)
    : (length * breadth) / 1_000_000
  const wastageFactor = 1 + (wastagePercent / 100)

  const layers = inputs.layers.map((layer) => {
    const gsm = Number(layer.gsm)
    const paperPricePerKg = Number(layer.paperPricePerKg)
    const drawRatio = Number(layer.drawRatio)
    const baseWeightKg = areaSqM * (gsm / 1000) * drawRatio * quantity
    const totalRequirementKg = baseWeightKg * wastageFactor
    const wastageWeightKg = totalRequirementKg - baseWeightKg
    return {
      key: layer.key,
      label: layer.label,
      gsm,
      paperPricePerKg,
      baseWeightKg,
      wastageWeightKg,
      totalRequirementKg,
      totalPaperCost: totalRequirementKg * paperPricePerKg,
    }
  })

  if (layers.some((layer) => !Number.isFinite(layer.gsm) || layer.gsm <= 0
    || !Number.isFinite(layer.paperPricePerKg) || layer.paperPricePerKg < 0
    || !Number.isFinite(layer.totalRequirementKg))) {
    return null
  }

  const totalBaseWeightKg = layers.reduce((total, layer) => total + layer.baseWeightKg, 0)
  const totalWastageWeightKg = layers.reduce((total, layer) => total + layer.wastageWeightKg, 0)
  const totalPaperRequirementKg = layers.reduce((total, layer) => total + layer.totalRequirementKg, 0)
  const totalPaperCost = layers.reduce((total, layer) => total + layer.totalPaperCost, 0)

  return {
    areaSqM,
    sizeCm,
    deckleCm,
    layers,
    totalBaseWeightKg,
    totalWastageWeightKg,
    totalPaperRequirementKg,
    totalPaperCost,
    paperCostPerUnit: totalPaperCost / quantity,
  }
}
