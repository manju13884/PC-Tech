import type { MasterDataValues } from '../master-data/masterDataFields'
import { ADVANCED_PAPER_WEIGHT_CONSTANTS as PAPER } from '../advanced-corrugated-box-calculator/constants/advancedPaperWeightConstants.ts'
import { BOARD_DEFAULT_PAPER_RATE } from '../corrugated-board-price-calculator/boardCalculatorConfig.ts'

export type PartitionPly = 3 | 5 | 7
export type Flute = 'B' | 'C' | 'A' | 'E'
export type LayerKey =
  'top' | 'flute1' | 'liner1' | 'flute2' | 'liner2' | 'flute3' | 'bottom'
export type Layer = {
  gsm: string
  bf: string
  shade: 'GYT' | 'Natural' | 'White'
  rate: string
  flute: Flute
  drawRatio: string
}
export type ConversionBasis = 'kg' | 'area' | 'set'
export const CONVERSION_OPTIONS = {
  kg: { label: 'Per KG', unit: '\u20b9/KG' },
  area: { label: 'Per Sq. Meter', unit: '\u20b9/m\u00b2' },
  set: { label: 'Per Partition Set', unit: '\u20b9/Set' },
} as const
export const conversionRateLabel = (basis: ConversionBasis) =>
  `Conversion Rate (${CONVERSION_OPTIONS[basis].unit})`
export type PricingMethod = 'margin' | 'markup'
export interface PartitionState {
  ply: PartitionPly
  length: string
  width: string
  height: string
  cellLength: string
  cellWidth: string
  thickness: string
  lengthProjection: string
  widthProjection: string
  quantity: string
  wastage: string
  slotOverride: string | null
  slotWidthOverride: string | null
  conversionBasis: ConversionBasis
  conversionRate: string
  pricingMethod: PricingMethod
  pricingPercent: string
  layers: Record<LayerKey, Layer>
}
export const FLUTE_RATIOS: Readonly<Partial<Record<Flute, number>>> = {
  B: PAPER.drawRatioB,
  C: PAPER.drawRatioC,
  A: PAPER.drawRatioA,
}
export const PLY_LAYERS: Record<PartitionPly, readonly LayerKey[]> = {
  3: ['top', 'flute1', 'bottom'],
  5: ['top', 'flute1', 'liner1', 'flute2', 'bottom'],
  7: ['top', 'flute1', 'liner1', 'flute2', 'liner2', 'flute3', 'bottom'],
}
export const isFlute = (key: LayerKey) => key.startsWith('flute')
export function layerLabel(key: LayerKey, ply: PartitionPly): string {
  if (key === 'top') return 'Top Liner'
  if (key === 'bottom') return 'Bottom Liner'
  if (key === 'flute1' && ply === 3) return 'Flute'
  if (key === 'liner1' && ply === 5) return 'Middle Liner'
  return key.replace(/(\d)/, ' $1').replace(/^./, (c) => c.toUpperCase())
}
export function createPartitionState(defaults?: MasterDataValues): PartitionState {
  const layer = (flute: Flute = 'B'): Layer => ({
    gsm: '120',
    bf: '18',
    shade: 'Natural',
    rate: defaults?.paperPrice ?? String(BOARD_DEFAULT_PAPER_RATE),
    flute,
    drawRatio: String(FLUTE_RATIOS[flute] ?? ''),
  })
  return {
    ply: 5,
    length: '',
    width: '',
    height: '',
    cellLength: '100',
    cellWidth: '100',
    thickness: '',
    lengthProjection: '',
    widthProjection: '',
    quantity: '500',
    wastage: defaults?.wastage ?? String(Number(((PAPER.wastageFactor - 1) * 100).toFixed(6))),
    slotOverride: null,
    slotWidthOverride: null,
    conversionBasis: 'kg',
    conversionRate: defaults?.ratePerKg ?? '0',
    pricingMethod: 'margin',
    pricingPercent: defaults?.margin ?? '0',
    layers: {
      top: layer(),
      flute1: layer(),
      liner1: layer(),
      flute2: layer('C'),
      liner2: layer(),
      flute3: layer('A'),
      bottom: layer(),
    },
  }
}
export function changeFlute(layer: Layer, flute: Flute): Layer {
  return { ...layer, flute, drawRatio: String(FLUTE_RATIOS[flute] ?? '') }
}
const positive = (n: number) => Number.isFinite(n) && n > 0
const nonnegative = (n: number) => Number.isFinite(n) && n >= 0
const count = (n: number) => Number.isSafeInteger(n) && n >= 1
function requireValues(valid: boolean) {
  if (!valid) throw new RangeError('Enter valid finite values.')
}
export function calculateCellSize(
  length: number,
  width: number,
  cellsLength: number,
  cellsWidth: number,
  thickness: number,
  lengthProjection: number,
  widthProjection: number,
) {
  requireValues(
    positive(length) &&
      positive(width) &&
      count(cellsLength) &&
      count(cellsWidth) &&
      positive(thickness) &&
      nonnegative(lengthProjection) &&
      nonnegative(widthProjection),
  )
  const clearLength =
    (length - (cellsLength + 1) * thickness - 2 * lengthProjection) /
    cellsLength
  const clearWidth =
    (width - (cellsWidth + 1) * thickness - 2 * widthProjection) / cellsWidth
  requireValues(positive(clearLength) && positive(clearWidth))
  return { length: clearLength, width: clearWidth }
}
// Exact decimal arithmetic prevents rounding a fractional cell into a manufacturing count.
export function calculateCellFit(
  outer: number,
  cell: number,
  thickness: number,
  projection: number,
) {
  requireValues(
    positive(outer) &&
      positive(cell) &&
      positive(thickness) &&
      nonnegative(projection),
  )
  const decimal = (value: number) => {
    const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e')
    return {
      units: BigInt(mantissa.replace('.', '')),
      exponent: Number(exponent) - (mantissa.split('.')[1]?.length ?? 0),
    }
  }
  const values = [outer, cell, thickness, projection].map(decimal)
  const exponent = Math.min(...values.map((value) => value.exponent))
  const [o, c, t, p] = values.map(
    (value) => value.units * 10n ** BigInt(value.exponent - exponent),
  )
  const numerator = o - t - 2n * p,
    denominator = c + t
  requireValues(numerator > 0n)
  const whole = numerator / denominator,
    remainder = numerator % denominator
  requireValues(whole < BigInt(Number.MAX_SAFE_INTEGER))
  const nearestCount = Number(whole + (2n * remainder >= denominator ? 1n : 0n))
  const actualCell =
    nearestCount > 0
      ? (outer - (nearestCount + 1) * thickness - 2 * projection) / nearestCount
      : undefined
  const difference =
    nearestCount > 0
      ? nearestCount * cell +
        (nearestCount + 1) * thickness +
        2 * projection -
        outer
      : undefined
  return {
    count: remainder === 0n && whole >= 1n ? Number(whole) : null,
    calculatedCount:
      Number(whole) +
      Number((remainder * 1000000000000n) / denominator) / 1000000000000,
    nearestCount,
    actualCell:
      actualCell !== undefined && positive(actualCell) ? actualCell : undefined,
    cellDifference:
      actualCell !== undefined && positive(actualCell)
        ? actualCell - cell
        : undefined,
    difference:
      difference !== undefined && Number.isFinite(difference)
        ? difference
        : undefined,
  }
}
export function dimensionBreakdown(
  cells: number,
  cell: number,
  thickness: number,
  projection: number,
) {
  requireValues(
    count(cells) &&
      positive(cell) &&
      positive(thickness) &&
      nonnegative(projection),
  )
  const total = cells * cell + (cells + 1) * thickness + 2 * projection
  requireValues(Number.isFinite(total))
  const parts =
    cells <= 20
      ? [
          projection,
          thickness,
          ...Array.from({ length: cells }, () => [cell, thickness]).flat(),
          projection,
        ].join(' + ')
      : `${cells} \u00d7 ${cell} + ${cells + 1} \u00d7 ${thickness} + 2 \u00d7 ${projection}`
  return `${parts} = ${Number(total.toPrecision(15))} mm`
}
export function calculateCellCounts(
  length: number,
  width: number,
  cellLength: number,
  cellWidth: number,
  thickness: number,
  lengthProjection: number,
  widthProjection: number,
) {
  const alongLength = calculateCellFit(
    length,
    cellLength,
    thickness,
    lengthProjection,
  )
  const alongWidth = calculateCellFit(
    width,
    cellWidth,
    thickness,
    widthProjection,
  )
  requireValues(alongLength.count !== null && alongWidth.count !== null)
  return { length: alongLength.count!, width: alongWidth.count! }
}
export function calculatePartitionPieces(
  cellsLength: number,
  cellsWidth: number,
) {
  requireValues(
    count(cellsLength) &&
      count(cellsWidth) &&
      Number.isSafeInteger(cellsLength + cellsWidth + 2),
  )
  return {
    length: cellsWidth + 1,
    width: cellsLength + 1,
    total: cellsLength + cellsWidth + 2,
  }
}
export function calculatePartitionArea(
  length: number,
  width: number,
  height: number,
  cellsLength: number,
  cellsWidth: number,
  quantity: number,
  wastage: number,
) {
  requireValues(
    positive(length) &&
      positive(width) &&
      positive(height) &&
      count(quantity) &&
      nonnegative(wastage),
  )
  const pieces = calculatePartitionPieces(cellsLength, cellsWidth)
  const lengthPiece = (length / 1000) * (height / 1000)
  const widthPiece = (width / 1000) * (height / 1000)
  const lengthArea = lengthPiece * pieces.length,
    widthArea = widthPiece * pieces.width
  const perSet = lengthArea + widthArea
  return {
    lengthPiece,
    widthPiece,
    lengthArea,
    widthArea,
    perSet,
    order: perSet * quantity,
    finalPerSet: perSet * (1 + wastage / 100),
    finalOrder: perSet * quantity * (1 + wastage / 100),
  }
}
export function calculatePartitionGrid(
  length: number,
  width: number,
  cellLength: number,
  cellWidth: number,
  thickness: number,
  lengthProjection: number,
  widthProjection: number,
) {
  const counts = calculateCellCounts(
    length,
    width,
    cellLength,
    cellWidth,
    thickness,
    lengthProjection,
    widthProjection,
  )
  const cells = calculateCellSize(
    length,
    width,
    counts.length,
    counts.width,
    thickness,
    lengthProjection,
    widthProjection,
  )
  const pieces = calculatePartitionPieces(counts.length, counts.width)
  const totalCells = counts.length * counts.width
  requireValues(
    Number.isSafeInteger(totalCells) && Number.isSafeInteger(pieces.total),
  )
  return {
    counts,
    cells,
    pieces,
    totalCells,
    verticalDividers: pieces.width,
    horizontalDividers: pieces.length,
    slotsPerPiece: {
      length: pieces.length > 0 ? pieces.width : 0,
      width: pieces.width > 0 ? pieces.length : 0,
    },
  }
}
export function calculateSlotWidth(thickness: number, override: string | null) {
  const width =
    override === null ? thickness : override.trim() ? Number(override) : NaN
  requireValues(positive(thickness) && positive(width))
  return width
}
export function calculateSlotConfiguration(
  cellsLength: number,
  cellsWidth: number,
  thickness: number,
  height: number,
  widthOverride: string | null,
  depthOverride: string | null,
) {
  const strips = calculatePartitionPieces(cellsLength, cellsWidth)
  return {
    width: calculateSlotWidth(thickness, widthOverride),
    depth: calculateSlotDepth(height, depthOverride),
    lengthSlotsPerPiece: strips.length > 0 ? strips.width : 0,
    widthSlotsPerPiece: strips.width > 0 ? strips.length : 0,
  }
}
export function calculatePartitionGeometry(state: PartitionState) {
  requireValues(
    state.lengthProjection.trim() !== '' && state.widthProjection.trim() !== '',
  )
  const outer = {
    length: Number(state.length),
    width: Number(state.width),
    height: Number(state.height),
  }
  requireValues(Object.values(outer).every(positive))
  const thickness = Number(state.thickness)
  const projections = {
    length: Number(state.lengthProjection),
    width: Number(state.widthProjection),
  }
  const requested = {
    length: Number(state.cellLength),
    width: Number(state.cellWidth),
  }
  const grid = calculatePartitionGrid(
    outer.length,
    outer.width,
    requested.length,
    requested.width,
    thickness,
    projections.length,
    projections.width,
  )
  const slots = calculateSlotConfiguration(
    grid.counts.length,
    grid.counts.width,
    thickness,
    outer.height,
    state.slotWidthOverride,
    state.slotOverride,
  )
  const reconstructed = {
    length:
      grid.counts.length * requested.length +
      grid.pieces.width * thickness +
      2 * projections.length,
    width:
      grid.counts.width * requested.width +
      grid.pieces.length * thickness +
      2 * projections.width,
  }
  requireValues(Object.values(reconstructed).every(positive))
  return {
    ...grid,
    outer,
    thickness,
    projections,
    requested,
    slots,
    ply: state.ply,
    reconstructed,
    isExactFit: true as const,
    breakdown: {
      length: dimensionBreakdown(
        grid.counts.length,
        requested.length,
        thickness,
        projections.length,
      ),
      width: dimensionBreakdown(
        grid.counts.width,
        requested.width,
        thickness,
        projections.width,
      ),
    },
  }
}
export type PartitionGeometry = ReturnType<typeof calculatePartitionGeometry>

// Drawing coordinates are derived here, never re-inferred by the SVG component.
// Patterns represent arbitrarily many strips without allocating one DOM node per strip.
export function partitionDrawingLayout(g: PartitionGeometry) {
  const largest = Math.max(g.outer.length, g.outer.width)
  const scale = (value: number) => (value / largest) * 500
  const width = scale(g.outer.length),
    height = scale(g.outer.width)
  const t = scale(g.thickness),
    px = scale(g.projections.length),
    py = scale(g.projections.width)
  const cellWidth = scale(g.cells.length),
    cellHeight = scale(g.cells.width)
  const pitchX = cellWidth + t,
    pitchY = cellHeight + t
  const numbers =
    g.totalCells <= 100 && cellWidth >= 22 && cellHeight >= 22
      ? Array.from({ length: g.totalCells }, (_, i) => ({
          number: i + 1,
          x: px + t + (i % g.counts.length) * pitchX + cellWidth / 2,
          y: py + t + Math.floor(i / g.counts.length) * pitchY + cellHeight / 2,
        }))
      : []
  const sideLargest = Math.max(largest, g.outer.height)
  const sideScale = (value: number) => (value / sideLargest) * 360
  const sideHeight = sideScale(g.outer.height)
  const side = (direction: 'length' | 'width') => ({
    width: sideScale(g.outer[direction]),
    height: sideHeight,
    thickness: sideScale(g.thickness),
    depth: sideScale(g.slots.depth),
    slotWidth: sideScale(g.slots.width),
    pitch: sideScale(g.cells[direction]) + sideScale(g.thickness),
    firstSlot:
      sideScale(g.projections[direction]) +
      sideScale(g.thickness) / 2 -
      sideScale(g.slots.width) / 2,
    count: direction === 'length' ? g.pieces.width : g.pieces.length,
    // Clip slot repetition to exactly the crossing strip positions.
    slotSpan:
      (direction === 'length' ? g.pieces.width - 1 : g.pieces.length - 1) *
        (sideScale(g.cells[direction]) + sideScale(g.thickness)) +
      sideScale(g.slots.width),
  })
  const layout = {
    width,
    height,
    t,
    px,
    py,
    cellWidth,
    cellHeight,
    pitchX,
    pitchY,
    gridWidth: width - 2 * px,
    gridHeight: height - 2 * py,
    numbers,
    cell: { x: px + t, y: py + t },
    sideA: side('length'),
    sideB: side('width'),
  }
  const finite = (v: unknown): boolean =>
    typeof v === 'number'
      ? Number.isFinite(v)
      : typeof v === 'object' && v !== null
        ? Object.values(v).every(finite)
        : true
  requireValues(
    finite(layout) &&
      [
        width,
        height,
        t,
        cellWidth,
        cellHeight,
        pitchX,
        pitchY,
        layout.gridWidth,
        layout.gridHeight,
      ].every(positive),
  )
  return layout
}

// Area passed here already includes wastage; quantity is applied once by the caller.
export function calculateLayerWeight(area: number, gsm: number, drawRatio = 1) {
  requireValues(nonnegative(area) && positive(gsm) && positive(drawRatio))
  return (area * drawRatio * gsm) / 1000
}
export function calculatePaperCost(weight: number, rate: number) {
  requireValues(nonnegative(weight) && nonnegative(rate))
  return weight * rate
}
export function calculateConversionCost(
  area: number,
  quantity: number,
  rate: number,
  basis: ConversionBasis,
  weight?: number,
) {
  requireValues(
    nonnegative(area) &&
      count(quantity) &&
      nonnegative(rate) &&
      ['kg', 'area', 'set'].includes(basis) &&
      (basis !== 'kg' || nonnegative(weight ?? NaN)),
  )
  return (basis === 'kg' ? weight! : basis === 'area' ? area : quantity) * rate
}
export function calculateSellingPrice(
  cost: number,
  percent: number,
  method: PricingMethod,
) {
  requireValues(
    nonnegative(cost) &&
      nonnegative(percent) &&
      ['margin', 'markup'].includes(method) &&
      (method !== 'margin' || percent < 100),
  )
  return method === 'margin'
    ? cost / (1 - percent / 100)
    : cost * (1 + percent / 100)
}
export function calculateSlotDepth(height: number, override: string | null) {
  const slot =
    override === null ? height / 2 : override.trim() ? Number(override) : NaN
  requireValues(positive(height) && positive(slot) && slot <= height)
  return slot
}
export function validatePartition(
  state: PartitionState,
): Record<string, string> {
  const errors: Record<string, string> = {}
  const check = (
    key: string,
    value: string,
    predicate: (n: number) => boolean,
    message: string,
  ) => {
    if (!value.trim() || !predicate(Number(value))) errors[key] = message
  }
  for (const key of ['length', 'width', 'height'] as const)
    check(key, state[key], positive, 'Enter a dimension greater than zero.')
  check('quantity', state.quantity, count, 'Enter a positive whole number.')
  check(
    'thickness',
    state.thickness,
    positive,
    'Enter the actual finished partition thickness greater than zero.',
  )
  for (const projection of ['lengthProjection', 'widthProjection'] as const)
    check(
      projection,
      state[projection],
      nonnegative,
      'Enter a projection per side of zero or greater.',
    )
  for (const [key, dimension, projection] of [
    ['cellLength', 'length', 'lengthProjection'],
    ['cellWidth', 'width', 'widthProjection'],
  ] as const) {
    check(
      key,
      state[key],
      positive,
      'Cell internal size must be greater than zero.',
    )
    if (
      !errors[key] &&
      !errors[dimension] &&
      !errors.thickness &&
      !errors[projection]
    ) {
      try {
        const fit = calculateCellFit(
          Number(state[dimension]),
          Number(state[key]),
          Number(state.thickness),
          Number(state[projection]),
        )
        if (fit.count === null)
          errors[key] =
            'Entered dimensions do not produce an exact partition configuration.'
      } catch {
        errors[key] =
          'Dimensions cannot produce a valid cell count. Check outer size, cell size, thickness and projections.'
      }
    }
  }
  check('wastage', state.wastage, nonnegative, 'Wastage cannot be negative.')
  check(
    'conversionRate',
    state.conversionRate,
    nonnegative,
    'Enter zero or a positive rate.',
  )
  check(
    'pricingPercent',
    state.pricingPercent,
    (n) => nonnegative(n) && (state.pricingMethod !== 'margin' || n < 100),
    state.pricingMethod === 'margin'
      ? 'Margin must be at least 0 and below 100%.'
      : 'Markup cannot be negative.',
  )
  if (!(state.ply in PLY_LAYERS)) errors.ply = 'Select 3, 5 or 7 Ply.'
  if (!['kg', 'area', 'set'].includes(state.conversionBasis))
    errors.conversionBasis = 'Select a conversion basis.'
  if (!['margin', 'markup'].includes(state.pricingMethod))
    errors.pricingMethod = 'Select a pricing method.'
  if (!errors.height) {
    try {
      calculateSlotDepth(Number(state.height), state.slotOverride)
    } catch {
      errors.slotOverride =
        'Slot depth must be greater than zero and no greater than the height.'
    }
  }
  if (!errors.thickness) {
    try {
      calculateSlotWidth(Number(state.thickness), state.slotWidthOverride)
    } catch {
      errors.slotWidthOverride = 'Slot width must be greater than zero.'
    }
  }
  for (const key of PLY_LAYERS[state.ply] ?? []) {
    const layer = state.layers[key]
    check(`${key}.gsm`, layer.gsm, positive, 'GSM must be greater than zero.')
    check(
      `${key}.rate`,
      layer.rate,
      nonnegative,
      'Paper rate cannot be negative.',
    )
    check(`${key}.bf`, layer.bf, positive, 'BF must be greater than zero.')
    if (!['GYT', 'Natural', 'White'].includes(layer.shade))
      errors[`${key}.shade`] = 'Select a paper shade.'
    if (isFlute(key))
      check(
        `${key}.drawRatio`,
        layer.drawRatio,
        (n) => Number.isFinite(n) && n >= 1,
        'Enter a draw ratio of at least 1. E flute requires your configured ratio.',
      )
  }
  return errors
}
function calculatePartitionChecked(
  state: PartitionState,
  geometry: PartitionGeometry | null,
) {
  const errors = validatePartition(state)
  if (Object.keys(errors).length) return { errors, result: null }
  const length = Number(state.length),
    width = Number(state.width),
    height = Number(state.height)
  const quantity = Number(state.quantity)
  if (!geometry) throw new RangeError('Invalid geometry')
  const grid = geometry
  const cellCounts = grid.counts
  const cellsLength = cellCounts.length,
    cellsWidth = cellCounts.width
  const requestedCells = {
    length: Number(state.cellLength),
    width: Number(state.cellWidth),
  }
  const thickness = Number(state.thickness)
  const cells = grid.cells
  const pieces = grid.pieces
  const slots = geometry.slots
  const area = calculatePartitionArea(
    length,
    width,
    height,
    cellsLength,
    cellsWidth,
    quantity,
    Number(state.wastage),
  )
  const layers = PLY_LAYERS[state.ply].map((key) => {
    const layer = state.layers[key],
      ratio = isFlute(key) ? Number(layer.drawRatio) : 1
    const weightPerSet = calculateLayerWeight(
      area.finalPerSet,
      Number(layer.gsm),
      ratio,
    )
    const costPerSet = calculatePaperCost(weightPerSet, Number(layer.rate))
    return {
      key,
      ratio,
      weightPerSet,
      weight: weightPerSet * quantity,
      costPerSet,
      cost: costPerSet * quantity,
    }
  })
  const weightPerSet = layers.reduce(
    (sum, layer) => sum + layer.weightPerSet,
    0,
  )
  const materialPerSet = layers.reduce(
    (sum, layer) => sum + layer.costPerSet,
    0,
  )
  const conversion = calculateConversionCost(
    area.finalOrder,
    quantity,
    Number(state.conversionRate),
    state.conversionBasis,
    weightPerSet * quantity,
  )
  const conversionPerSet = conversion / quantity,
    costPerSet = materialPerSet + conversionPerSet
  const sellingPerSet = calculateSellingPrice(
    costPerSet,
    Number(state.pricingPercent),
    state.pricingMethod,
  )
  const result = {
    cellCounts,
    totalCells: grid.totalCells,
    verticalDividers: grid.verticalDividers,
    horizontalDividers: grid.horizontalDividers,
    slots,
    cells,
    requestedCells,
    thickness,
    pieces,
    area,
    layers,
    quantity,
    slotDepth: slots.depth,
    slotWidth: slots.width,
    weightPerSet,
    weight: weightPerSet * quantity,
    materialPerSet,
    material: materialPerSet * quantity,
    conversionPerSet,
    conversion,
    costPerSet,
    cost: costPerSet * quantity,
    sellingPerSet,
    selling: sellingPerSet * quantity,
    profitPerSet: sellingPerSet - costPerSet,
    profit: (sellingPerSet - costPerSet) * quantity,
  }
  // Overflow must never leak Infinity/NaN into the screen, even for extreme finite inputs.
  const finite = (value: unknown): boolean =>
    typeof value === 'number'
      ? Number.isFinite(value)
      : typeof value === 'object' && value !== null
        ? Object.values(value).every(finite)
        : true
  return finite(result)
    ? { errors, result }
    : {
        errors: {
          calculation: 'Values are too large to calculate. Reduce the inputs.',
        },
        result: null,
      }
}
export function calculatePartition(state: PartitionState) {
  let geometry: PartitionGeometry | null = null
  try {
    geometry = calculatePartitionGeometry(state)
  } catch {
    /* Incomplete or non-exact geometry. */
  }
  try {
    return { ...calculatePartitionChecked(state, geometry), geometry }
  } catch {
    return {
      geometry: null,
      errors: {
        calculation: 'Values are too large or invalid. Check the inputs.',
      },
      result: null,
    }
  }
}
