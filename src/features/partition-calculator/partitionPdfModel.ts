import {
  CONVERSION_OPTIONS,
  isFlute,
  layerLabel,
} from './partitionCalculatorEngine.ts'
import type {
  calculatePartition,
  PartitionState,
} from './partitionCalculatorEngine.ts'
import { formatIstDate, formatIstTime } from '../../utils/dateTimeFormatting.ts'

export type PdfSection = { title: string; rows: string[][] }
const number = (n: number, digits = 3) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: digits })
const money = (n: number) =>
  `INR ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function partitionPdfModel(
  state: PartitionState,
  calculation: ReturnType<typeof calculatePartition>,
  includeCosting: boolean,
  generatedBy: string,
  date = new Date(),
) {
  const { result: r, geometry: g, errors } = calculation
  if (!r || !g || !g.isExactFit || Object.keys(errors).length)
    throw new Error(
      'Complete valid partition dimensions, paper composition and costing before saving a PDF.',
    )
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (key: string) => day.find((value) => value.type === key)!.value
  const filename =
    `Partition_${g.ply}Ply_${g.outer.length}X${g.outer.width}X${g.outer.height}_${part('year')}${part('month')}${part('day')}.pdf`.replace(
      /[^a-zA-Z0-9_.-]/g,
      '_',
    )
  const details: PdfSection = {
    title: 'PARTITION DETAILS',
    rows: [
      ['Ply', `${g.ply} Ply`, 'Quantity', number(r.quantity, 0)],
      [
        'Outer size (L x W x H)',
        `${number(g.outer.length)} x ${number(g.outer.width)} x ${number(g.outer.height)} mm`,
        'Thickness',
        `${number(g.thickness)} mm`,
      ],
      [
        'Requested cell (L x W)',
        `${number(g.requested.length)} x ${number(g.requested.width)} mm`,
        'Slot width / depth',
        `${number(g.slots.width)} / ${number(g.slots.depth)} mm`,
      ],
      [
        'Length projection',
        `${number(g.projections.length)} mm / side`,
        'Width projection',
        `${number(g.projections.width)} mm / side`,
      ],
    ],
  }
  const cells: PdfSection = {
    title: 'CELL CONFIGURATION',
    rows: [
      [
        'Cells along L / W',
        `${g.counts.length} / ${g.counts.width}`,
        'Total cells',
        String(g.totalCells),
      ],
      [
        'Group A / Group B',
        `${g.pieces.length} / ${g.pieces.width}`,
        'Total strips / set',
        String(g.pieces.total),
      ],
      [
        'Actual cell (L x W)',
        `${number(g.cells.length)} x ${number(g.cells.width)} mm`,
        'Dimension status',
        'DIMENSIONS MATCH',
      ],
    ],
  }
  const paperHeaders = [
    'Layer',
    'GSM',
    'BF',
    'Shade',
    'Flute',
    'Ratio',
    'kg/Set',
    ...(includeCosting ? ['INR/kg', 'INR/Set'] : []),
  ]
  const paperRows = r.layers.map((row) => {
    const layer = state.layers[row.key]
    return [
      layerLabel(row.key, state.ply),
      layer.gsm,
      layer.bf,
      layer.shade,
      isFlute(row.key) ? layer.flute : '-',
      isFlute(row.key) ? number(row.ratio) : '-',
      number(row.weightPerSet),
      ...(includeCosting
        ? [number(Number(layer.rate), 2), number(row.costPerSet, 2)]
        : []),
    ]
  })
  const material: PdfSection = {
    title: 'MATERIAL SUMMARY',
    rows: [
      [
        'Board area / set (net)',
        `${number(r.area.perSet)} m2`,
        'Order board area (net)',
        `${number(r.area.order)} m2`,
      ],
      [
        'Board area / set (gross)',
        `${number(r.area.finalPerSet)} m2`,
        'Order board area (gross)',
        `${number(r.area.finalOrder)} m2`,
      ],
      [
        'Paper weight / set',
        `${number(r.weightPerSet)} kg`,
        'Total paper weight',
        `${number(r.weight)} kg`,
      ],
      [
        'Wastage',
        `${Number(state.wastage).toFixed(2)}%`,
        'Quantity',
        number(r.quantity, 0),
      ],
      ...(includeCosting
        ? [
            [
              'Material cost / set',
              money(r.materialPerSet),
              'Total material cost',
              money(r.material),
            ],
          ]
        : []),
    ],
  }
  const sections: PdfSection[] = [material]
  if (includeCosting) {
    sections.push({
      title: 'CONVERSION',
      rows: [
        [
          'Basis',
          CONVERSION_OPTIONS[state.conversionBasis].label,
          'Rate',
          `${money(Number(state.conversionRate))}/${state.conversionBasis === 'kg' ? 'KG' : state.conversionBasis === 'area' ? 'm2' : 'Set'}`,
        ],
        [
          'Conversion cost / set',
          money(r.conversionPerSet),
          'Total conversion cost',
          money(r.conversion),
        ],
      ],
    })
    sections.push({
      title: 'COSTING & PRICING',
      rows: [
        [
          'Material cost / set',
          money(r.materialPerSet),
          'Conversion cost / set',
          money(r.conversionPerSet),
        ],
        [
          'Total cost / set',
          money(r.costPerSet),
          'Selling price / set',
          money(r.sellingPerSet),
        ],
        [
          'Pricing method',
          state.pricingMethod === 'margin' ? 'Margin' : 'Markup',
          state.pricingMethod === 'margin' ? 'Margin %' : 'Markup %',
          `${Number(state.pricingPercent).toFixed(2)}%`,
        ],
        ['Quantity', number(r.quantity, 0), 'Total order cost', money(r.cost)],
        [
          'Total selling value',
          money(r.selling),
          'Gross profit',
          money(r.profit),
        ],
      ],
    })
  }
  return {
    filename,
    geometry: g,
    generatedBy: generatedBy.trim() || 'Not available',
    date: formatIstDate(date),
    time: `${formatIstTime(date)} IST`,
    title: includeCosting
      ? 'PARTITION CALCULATION SHEET'
      : 'PARTITION TECHNICAL SPECIFICATION',
    details,
    cells,
    paperHeaders,
    paperRows,
    sections,
    dimensionChecks: [
      `L (${g.counts.length} x ${number(g.requested.length)}) + (${g.pieces.width} x ${number(g.thickness)}) + (2 x ${number(g.projections.length)}) = ${number(g.reconstructed.length)} mm - MATCH`,
      `W (${g.counts.width} x ${number(g.requested.width)}) + (${g.pieces.length} x ${number(g.thickness)}) + (2 x ${number(g.projections.width)}) = ${number(g.reconstructed.width)} mm - MATCH`,
    ],
  }
}
export type PartitionPdfModel = ReturnType<typeof partitionPdfModel>
