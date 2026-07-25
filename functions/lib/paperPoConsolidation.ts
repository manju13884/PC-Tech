export interface PaperPoSourceRow {
  paperRequestId: number
  requestNumber: string
  customerName: string
  salesOrderId: string
  salesOrderNumber: string
  paperRequestItemId: number
  itemName: string
  itemType: string
  lengthMm: number | null
  breadthMm: number | null
  layerKey: string
  layerName: string
  paperType: string | null
  gsm: number | null
  bf: number | null
  deckleCm: number | null
  cutLengthCm: number | null
  quantity: number | null
}

export interface PaperPoSource {
  paperRequestId: number
  requestNumber: string
  customerName: string
  salesOrderId: string
  salesOrderNumber: string
  itemName: string
  itemType: string
  layerKey: string
  layerName: string
  paperType: string
  gsm: number
  bf: number
  deckleCm: number | null
  cutLengthCm: number | null
  quantity: number
  unit: 'KG'
}

export interface ConsolidatedPaperRow {
  groupKey: string
  paperType: string
  gsm: number
  bf: number
  deckleCm: number | null
  cutLengthCm: number | null
  unit: 'KG'
  sourceRequestCount: number
  sourceSaleOrderCount: number
  sourceLayerCount: number
  sourceLayers: string[]
  consolidatedQuantity: number
  sources: PaperPoSource[]
}

export interface IncompletePaperRow {
  source: Omit<PaperPoSource, 'gsm' | 'bf' | 'quantity'> & {
    gsm: number | null
    bf: number | null
    quantity: number | null
  }
  missingSpecifications: string[]
}

const normalizedText = (value: string | null): string => value?.trim().toUpperCase() ?? ''
const numberKey = (value: number | null): string => (
  value === null || !Number.isFinite(value) ? '' : Number(value).toString()
)

export function consolidateApprovedPaperRows(rows: PaperPoSourceRow[]): {
  consolidatedRows: ConsolidatedPaperRow[]
  incompleteSpecificationRows: IncompletePaperRow[]
} {
  const groups = new Map<string, ConsolidatedPaperRow>()
  const incompleteSpecificationRows: IncompletePaperRow[] = []

  for (const row of rows) {
    const paperType = row.paperType?.trim() ?? ''
    const missing: string[] = []
    if (!paperType) missing.push('Paper Type')
    if (row.gsm === null || !Number.isFinite(row.gsm) || row.gsm <= 0) missing.push('GSM')
    if (row.bf === null || !Number.isFinite(row.bf) || row.bf <= 0) missing.push('BF')
    if (row.quantity === null || !Number.isFinite(row.quantity) || row.quantity <= 0) {
      missing.push('Final Paper Quantity')
    }
    if (row.itemType === 'BOX') {
      if (row.deckleCm === null || !Number.isFinite(row.deckleCm) || row.deckleCm <= 0) missing.push('Deckle')
      if (row.cutLengthCm === null || !Number.isFinite(row.cutLengthCm) || row.cutLengthCm <= 0) missing.push('Cut Length')
    } else {
      if (row.lengthMm === null || !Number.isFinite(row.lengthMm) || row.lengthMm <= 0) missing.push('Sheet Length')
      if (row.breadthMm === null || !Number.isFinite(row.breadthMm) || row.breadthMm <= 0) missing.push('Sheet Breadth')
    }

    const sourceBase = {
      paperRequestId: row.paperRequestId,
      requestNumber: row.requestNumber,
      customerName: row.customerName,
      salesOrderId: row.salesOrderId,
      salesOrderNumber: row.salesOrderNumber,
      itemName: row.itemName,
      itemType: row.itemType,
      layerKey: row.layerKey,
      layerName: row.layerName,
      paperType,
      gsm: row.gsm,
      bf: row.bf,
      deckleCm: row.deckleCm,
      cutLengthCm: row.cutLengthCm,
      quantity: row.quantity,
      unit: 'KG' as const,
    }

    if (missing.length > 0) {
      incompleteSpecificationRows.push({ source: sourceBase, missingSpecifications: missing })
      continue
    }

    const source = sourceBase as PaperPoSource
    const dimensionalKey = row.itemType === 'BOX'
      ? `${numberKey(row.deckleCm)}|${numberKey(row.cutLengthCm)}`
      : `${numberKey(row.lengthMm)}|${numberKey(row.breadthMm)}`
    const groupKey = [
      normalizedText(row.paperType),
      numberKey(row.gsm),
      numberKey(row.bf),
      row.itemType === 'BOX' ? 'REEL' : row.itemType,
      dimensionalKey,
      'KG',
    ].join('|')
    const current = groups.get(groupKey)
    if (current) {
      current.sources.push(source)
      current.consolidatedQuantity += source.quantity
      current.sourceRequestCount = new Set(current.sources.map((entry) => entry.paperRequestId)).size
      current.sourceSaleOrderCount = new Set(current.sources.map((entry) => entry.salesOrderId)).size
      current.sourceLayerCount = current.sources.length
      current.sourceLayers = [...new Set(current.sources.map((entry) => entry.layerName))]
    } else {
      groups.set(groupKey, {
        groupKey,
        paperType,
        gsm: source.gsm,
        bf: source.bf,
        deckleCm: source.deckleCm,
        cutLengthCm: source.cutLengthCm,
        unit: 'KG',
        sourceRequestCount: 1,
        sourceSaleOrderCount: 1,
        sourceLayerCount: 1,
        sourceLayers: [source.layerName],
        consolidatedQuantity: source.quantity,
        sources: [source],
      })
    }
  }

  return {
    consolidatedRows: [...groups.values()].sort((left, right) => (
      left.paperType.localeCompare(right.paperType)
      || left.gsm - right.gsm
      || left.bf - right.bf
      || (left.deckleCm ?? 0) - (right.deckleCm ?? 0)
    )),
    incompleteSpecificationRows,
  }
}
