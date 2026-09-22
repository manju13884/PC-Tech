export const partitionTypes = ['Standard Equal Cell', 'Custom'] as const
export type PartitionType = typeof partitionTypes[number]

export interface PartitionCalculationInput {
  partitionType: string
  lengthMm: string | number
  widthMm: string | number
  heightMm: string | number
  rows: string | number
  columns: string | number
  cellLengthMm?: string | number
  cellWidthMm?: string | number
}

export interface PartitionPieceSummary {
  totalCells: number | null
  cellLengthMm: number | null
  cellWidthMm: number | null
  longPieces: number | null
  longPieceLengthMm: number | null
  longPieceHeightMm: number | null
  crossPieces: number | null
  crossPieceLengthMm: number | null
  crossPieceHeightMm: number | null
}

const positive = (value: string | number) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

const positiveInteger = (value: string | number) => {
  const number = positive(value)
  return number !== null && Number.isInteger(number) ? number : null
}

const roundedDimension = (value: number) => Math.round(value * 100) / 100

// Kept separate from persistence and costing so manufacturing formulas can evolve independently.
export function calculatePartitionSummary(input: PartitionCalculationInput): PartitionPieceSummary {
  const length = positive(input.lengthMm)
  const width = positive(input.widthMm)
  const height = positive(input.heightMm)
  const rows = positiveInteger(input.rows)
  const columns = positiveInteger(input.columns)
  const standard = input.partitionType === 'Standard Equal Cell'
  return {
    totalCells: rows !== null && columns !== null ? rows * columns : null,
    cellLengthMm: standard && length !== null && columns !== null
      ? roundedDimension(length / columns)
      : positive(input.cellLengthMm ?? ''),
    cellWidthMm: standard && width !== null && rows !== null
      ? roundedDimension(width / rows)
      : positive(input.cellWidthMm ?? ''),
    longPieces: standard && rows !== null ? Math.max(0, rows - 1) : null,
    longPieceLengthMm: standard ? length : null,
    longPieceHeightMm: standard ? height : null,
    crossPieces: standard && columns !== null ? Math.max(0, columns - 1) : null,
    crossPieceLengthMm: standard ? width : null,
    crossPieceHeightMm: standard ? height : null,
  }
}

export function validatePartition(input: PartitionCalculationInput & { ply: string; fluteType: string }): string {
  if (!partitionTypes.includes(input.partitionType as PartitionType)) return 'Select a valid Partition Type.'
  if (positive(input.lengthMm) === null) return 'Length must be greater than zero.'
  if (positive(input.widthMm) === null) return 'Width must be greater than zero.'
  if (positive(input.heightMm) === null) return 'Partition Height must be greater than zero.'
  if (positiveInteger(input.rows) === null) return 'No. of Rows must be a positive whole number.'
  if (positiveInteger(input.columns) === null) return 'No. of Columns must be a positive whole number.'
  if (!['3', '5', '7'].includes(input.ply)) return 'Select 3 Ply, 5 Ply, or 7 Ply for Corrugated Partitions.'
  if (!['A', 'B', 'C', 'E', 'F'].includes(input.fluteType)) return 'Select a valid Flute / Flute Run for Corrugated Partitions.'
  if (input.partitionType === 'Custom' && input.cellLengthMm !== '' && input.cellLengthMm != null && positive(input.cellLengthMm) === null) return 'Cell Length must be greater than zero when entered.'
  if (input.partitionType === 'Custom' && input.cellWidthMm !== '' && input.cellWidthMm != null && positive(input.cellWidthMm) === null) return 'Cell Width must be greater than zero when entered.'
  return ''
}
