import { useCalculatorMasterData } from '../master-data/CalculatorMasterData'
import { useState } from 'react'
import { Calculator, Layers3, RotateCcw, Ruler, CircleHelp } from 'lucide-react'
import {
  calculateCellFit,
  CONVERSION_OPTIONS,
  conversionRateLabel,
  calculateSlotWidth,
  calculatePartition,
  calculateSlotDepth,
  changeFlute,
  createPartitionState,
  isFlute,
  layerLabel,
  PLY_LAYERS,
} from './partitionCalculatorEngine'
import type {
  ConversionBasis,
  Flute,
  Layer,
  LayerKey,
  PartitionPly,
  PartitionState,
  PricingMethod,
} from './partitionCalculatorEngine'
import '../corrugated-board-price-calculator/corrugated-board-price-calculator.css'
import './partition-calculator.css'
import PartitionDrawing from './PartitionDrawing'
import { partitionPdfModel } from './partitionPdfModel'

const format = (value: number | undefined, digits = 3) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : value.toLocaleString('en-IN', { maximumFractionDigits: digits })
const money = (value: number | undefined) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
function NumberField({
  label,
  value,
  onChange,
  error,
  required = false,
  integer = false,
  calculated = false,
  help,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  integer?: boolean
  calculated?: boolean
  help?: string
}) {
  const [touched, setTouched] = useState(false)
  const showError = Boolean(error && (touched || value.trim()))
  return (
    <label className="board-field">
      <span>
        {label}
        {required && ' *'}
        {help && (
          <span
            className="partition-field-help"
            tabIndex={0}
            role="img"
            aria-label={help}
            title={help}
          >
            <CircleHelp size={12} aria-hidden="true" />
          </span>
        )}
      </span>
      <input
        className={calculated ? 'board-calculated-input' : undefined}
        type="number"
        step={integer ? '1' : 'any'}
        min="0"
        required={required}
        value={value}
        aria-invalid={showError}
        onBlur={() => setTouched(true)}
        onChange={(event) => {
          setTouched(true)
          onChange(event.target.value)
        }}
      />
      {showError && <small>{error}</small>}
    </label>
  )
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="partition-metric" data-label={label}>
      <span>{label}</span>
      <output aria-label={label}>{value}</output>
    </div>
  )
}

export default function PartitionCalculator({
  generatedBy = '',
}: {
  generatedBy?: string
}) {
  const defaults = useCalculatorMasterData()
  const [state, setState] = useState(() => createPartitionState(defaults))
  const calculation = calculatePartition(state)
  const { errors, result, geometry } = calculation
  const [includeCosting, setIncludeCosting] = useState(true)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const savePdf = async () => {
    if (!result || !geometry || pdfBusy) return
    setPdfBusy(true)
    setPdfError('')
    try {
      const model = partitionPdfModel(
        state,
        calculation,
        includeCosting,
        generatedBy,
      )
      const { savePartitionPdf } = await import('./partitionPdf')
      await savePartitionPdf(model)
    } catch (error) {
      setPdfError(
        error instanceof Error
          ? error.message
          : 'Unable to save PDF. Please try again.',
      )
    } finally {
      setPdfBusy(false)
    }
  }
  const field = <K extends keyof PartitionState>(
    key: K,
    value: PartitionState[K],
  ) => setState((current) => ({ ...current, [key]: value }))
  const layerField = (key: LayerKey, name: keyof Layer, value: string) =>
    setState((current) => ({
      ...current,
      layers: {
        ...current.layers,
        [key]: { ...current.layers[key], [name]: value },
      },
    }))
  const fits = (['length', 'width'] as const).map((direction) => {
    try {
      const projection =
        direction === 'length' ? state.lengthProjection : state.widthProjection
      if (!projection.trim()) return null
      return calculateCellFit(
        Number(state[direction]),
        Number(direction === 'length' ? state.cellLength : state.cellWidth),
        Number(state.thickness),
        Number(projection),
      )
    } catch {
      return null
    }
  })
  let autoSlotWidth = ''
  try {
    autoSlotWidth = String(calculateSlotWidth(Number(state.thickness), null))
  } catch {
    /* Enter a valid board thickness first. */
  }
  let autoSlot = ''
  try {
    autoSlot = String(calculateSlotDepth(Number(state.height), null))
  } catch {
    /* Height is not yet valid. */
  }
  const numericField = (
    key:
      | 'length'
      | 'width'
      | 'height'
      | 'cellLength'
      | 'cellWidth'
      | 'thickness'
      | 'lengthProjection'
      | 'widthProjection'
      | 'quantity'
      | 'wastage'
      | 'conversionRate'
      | 'pricingPercent',
    label: string,
    required = true,
    integer = false,
  ) => (
    <NumberField
      key={key}
      label={label}
      value={state[key]}
      onChange={(value) => field(key, value)}
      error={errors[key]}
      required={required}
      integer={integer}
      help={
        key === 'lengthProjection' || key === 'widthProjection'
          ? 'Strip projection beyond the outer crossing strip on each side.'
          : key === 'thickness'
            ? 'Actual finished corrugated board thickness; independent of ply.'
            : undefined
      }
    />
  )

  return (
    <div className="pc-corrugated-board-calculator partition-calculator">
      <div className="board-calculator-surface">
        <div className="partition-toolbar">
          <div className="partition-ply board-field">
            <span id="partition-ply-label" className="partition-sr-only">
              Partition Ply *
            </span>
            <div
              className="admin-config-tabs"
              role="group"
              aria-labelledby="partition-ply-label"
            >
              {([3, 5, 7] as PartitionPly[]).map((ply) => (
                <button
                  className={state.ply === ply ? 'active' : undefined}
                  key={ply}
                  type="button"
                  aria-pressed={state.ply === ply}
                  onClick={() => field('ply', ply)}
                >
                  {ply} Ply
                </button>
              ))}
            </div>
          </div>
          <div className="board-calculator-actions">
            <button
              type="button"
              className="board-calculator-refresh-button"
              onClick={() => {
                setState(createPartitionState(defaults))
                setIncludeCosting(true)
                setPdfError('')
              }}
            >
              <RotateCcw size={15} /> Reset
            </button>
          </div>
        </div>
        <section className="board-section">
          <header>
            <h3>
              <Ruler size={16} /> Partition Details
            </h3>
          </header>
          <div className="board-specification-grid partition-input-grid">
            {numericField('length', 'Outer Length (mm)')}
            {numericField('width', 'Outer Width (mm)')}
            {numericField('height', 'Outer Height (mm)')}
            {numericField('quantity', 'Quantity', true, true)}
          </div>
          <div className="board-specification-grid partition-dimension-grid">
            {numericField('cellLength', 'Cell Length (mm)')}
            {numericField('cellWidth', 'Cell Width (mm)')}
            {numericField('thickness', 'Thickness (mm)')}
            {numericField('wastage', 'Wastage (%)', false)}
          </div>
          <div className="board-specification-grid partition-dimension-grid">
            {numericField('lengthProjection', 'Length Projection (mm)')}
            {numericField('widthProjection', 'Width Projection (mm)')}
            <div>
              <NumberField
                label="Slot Width (mm)"
                help="Defaults to board thickness; editable for manufacturing clearance."
                value={state.slotWidthOverride ?? autoSlotWidth}
                calculated={state.slotWidthOverride === null}
                onChange={(value) => field('slotWidthOverride', value)}
                error={errors.slotWidthOverride}
              />
              {state.slotWidthOverride !== null ? (
                <div className="board-calculator-actions partition-slot-action">
                  <button
                    type="button"
                    className="board-calculator-refresh-button"
                    aria-label="Reset Slot Width to Auto"
                    onClick={() => field('slotWidthOverride', null)}
                  >
                    Reset to Auto
                  </button>
                </div>
              ) : (
                <small className="partition-hint">
                  Auto: partition thickness
                </small>
              )}
            </div>
            <div>
              <NumberField
                label="Slot Depth (mm)"
                help="Defaults to half the outer height. Use Reset to Auto to remove a manual override."
                required
                calculated={state.slotOverride === null}
                value={state.slotOverride ?? autoSlot}
                onChange={(value) => field('slotOverride', value)}
                error={errors.slotOverride}
              />
              {state.slotOverride !== null ? (
                <div className="board-calculator-actions partition-slot-action">
                  <button
                    className="board-calculator-refresh-button"
                    aria-label="Reset Slot Depth to Auto"
                    type="button"
                    onClick={() => field('slotOverride', null)}
                  >
                    Reset to Auto
                  </button>
                </div>
              ) : (
                <small className="partition-hint">
                  Auto: half the partition height
                </small>
              )}
            </div>
          </div>
        </section>
        <section className="board-section">
          <header>
            <h3>
              <Ruler size={16} /> Cell Configuration
            </h3>
          </header>
          <div className="partition-cell-row" aria-live="polite">
            <Metric
              label="Cells L"
              value={format(geometry?.counts.length, 0)}
            />
            <Metric label="Cells W" value={format(geometry?.counts.width, 0)} />
            <Metric
              label="Total Cells"
              value={format(geometry?.totalCells, 0)}
            />
            <Metric
              label="Cell Internal Size (mm)"
              value={
                geometry
                  ? `${format(geometry.cells.length)} \u00d7 ${format(geometry.cells.width)}`
                  : '\u2014'
              }
            />
            <Metric
              label="Total Strips / Set"
              value={format(geometry?.pieces.total, 0)}
            />
            <Metric
              label="Status"
              value={
                geometry
                  ? '\u2713 Match'
                  : fits.some((fit) => fit?.count === null)
                    ? 'Mismatch'
                    : 'Incomplete'
              }
            />
          </div>
          {fits.some((fit) => fit?.count === null) && (
            <p className="board-formula-notice" role="status">
              {errors.cellLength || errors.cellWidth || errors.thickness}
            </p>
          )}
          {fits.map(
            (fit, index) =>
              fit &&
              fit.count === null && (
                <div key={index}>
                  <p className="board-formula-notice">
                    {index === 0 ? 'Length' : 'Width'} fit preview only. Adjust
                    the inputs to obtain an exact configuration before costing.
                    Difference is reconstructed outer size minus entered outer
                    size.
                  </p>
                  <div className="board-specification-grid partition-input-grid">
                    <Metric
                      label={`${index === 0 ? 'Length' : 'Width'} Calculated Cell Count`}
                      value={format(fit.calculatedCount, 6)}
                    />
                    <Metric
                      label={`${index === 0 ? 'Length' : 'Width'} Nearest Whole Cell Count`}
                      value={format(fit.nearestCount, 0)}
                    />
                    <Metric
                      label={`${index === 0 ? 'Length' : 'Width'} Preview Actual Cell Size (mm)`}
                      value={format(fit.actualCell, 6)}
                    />
                    <Metric
                      label={`${index === 0 ? 'Length' : 'Width'} Outer Difference (mm)`}
                      value={format(fit.difference, 6)}
                    />
                  </div>
                </div>
              ),
          )}
        </section>
        <PartitionDrawing
          geometry={geometry}
          fits={fits}
          requested={{
            length: Number(state.cellLength),
            width: Number(state.cellWidth),
          }}
          ply={state.ply}
        />
        <details className="board-section partition-strip-details">
          <summary>Partition Strip Details</summary>
          <p className="partition-hint">
            Group A spans Outer Length; Group B spans Outer Width. Both include
            perimeter strips and projections.
          </p>
          <div className="board-layer-summary-table-wrap partition-table-wrap">
            <table className="board-layer-summary-table">
              <caption>Interlocking strips per complete partition set</caption>
              <thead>
                <tr>
                  <th>Direction</th>
                  <th>Qty / Set</th>
                  <th>Strip Size: Length × Height (mm)</th>
                  <th>Slots / Piece</th>
                  <th>Area / Piece (m²)</th>
                  <th>Area / Set (m²)</th>
                </tr>
              </thead>
              <tbody>
                {(['length', 'width'] as const).map((direction) => (
                  <tr key={direction}>
                    <th>
                      {direction === 'length'
                        ? 'Strip Group A'
                        : 'Strip Group B'}
                    </th>
                    <td>{format(geometry?.pieces[direction], 0)}</td>
                    <td>
                      {!errors[direction] && !errors.height
                        ? `${format(Number(state[direction]))} × ${format(Number(state.height))}`
                        : '—'}
                    </td>
                    <td>{format(geometry?.slotsPerPiece[direction], 0)}</td>
                    <td>
                      {format(
                        result?.area[
                          direction === 'length' ? 'lengthPiece' : 'widthPiece'
                        ],
                        4,
                      )}
                    </td>
                    <td>
                      {format(
                        result?.area[
                          direction === 'length' ? 'lengthArea' : 'widthArea'
                        ],
                        4,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="board-specification-grid partition-input-grid partition-table-wrap">
            <Metric
              label="Group A Slots / Piece"
              value={format(geometry?.slotsPerPiece.length, 0)}
            />
            <Metric
              label="Group B Slots / Piece"
              value={format(geometry?.slotsPerPiece.width, 0)}
            />
            <Metric
              label="Group A Area / Set (m²)"
              value={format(result?.area.lengthArea, 4)}
            />
            <Metric
              label="Group B Area / Set (m²)"
              value={format(result?.area.widthArea, 4)}
            />
            <Metric
              label="Board Area / Set (m²)"
              value={format(result?.area.perSet, 4)}
            />
            <Metric
              label="Wastage (%)"
              value={!errors.wastage ? format(Number(state.wastage)) : '\u2014'}
            />
            <Metric
              label="Final Board Area / Set (m²)"
              value={format(result?.area.finalPerSet)}
            />
            <Metric
              label="Total Board Area for Order (m²)"
              value={format(result?.area.finalOrder, 4)}
            />
          </div>
        </details>
        <section className="board-section">
          <header>
            <h3>
              <Layers3 size={16} /> Paper Composition
            </h3>
            <p>
              {state.ply} Ply · Each flute uses its own draw ratio. Enter your
              configured ratio for E flute.
            </p>
          </header>
          <div className="board-layer-summary-table-wrap partition-table-wrap">
            <table className="board-layer-summary-table partition-composition">
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>GSM *</th>
                  <th>BF *</th>
                  <th>Shade</th>
                  <th>Flute</th>
                  <th>Ratio *</th>
                  <th>Rate/KG (₹) *</th>
                  <th>Weight/Set (KG)</th>
                  <th>Cost/Set (₹)</th>
                </tr>
              </thead>
              <tbody>
                {PLY_LAYERS[state.ply].map((key) => {
                  const layer = state.layers[key],
                    label = layerLabel(key, state.ply)
                  return (
                    <tr key={key}>
                      <th scope="row">{label}</th>
                      {(['gsm', 'bf'] as const).map((name) => (
                        <td key={name}>
                          <NumberField
                            label={`${label} ${name.toUpperCase()}`}
                            value={layer[name]}
                            onChange={(value) => layerField(key, name, value)}
                            error={errors[`${key}.${name}`]}
                            required
                          />
                        </td>
                      ))}
                      <td data-label="Shade">
                        <div className="board-field">
                          <select
                            aria-label={`${label} Shade`}
                            value={layer.shade}
                            onChange={(event) =>
                              layerField(key, 'shade', event.target.value)
                            }
                          >
                            {['GYT', 'Natural', 'White'].map((shade) => (
                              <option key={shade}>{shade}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td data-label="Flute">
                        {isFlute(key) ? (
                          <div className="board-field">
                            <select
                              aria-label={`${label} Flute Type`}
                              value={layer.flute}
                              onChange={(event) =>
                                setState((current) => ({
                                  ...current,
                                  layers: {
                                    ...current.layers,
                                    [key]: changeFlute(
                                      current.layers[key],
                                      event.target.value as Flute,
                                    ),
                                  },
                                }))
                              }
                            >
                              {['B', 'C', 'A', 'E'].map((flute) => (
                                <option key={flute}>{flute}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {isFlute(key) ? (
                          <NumberField
                            label={`${label} Draw Ratio`}
                            value={layer.drawRatio}
                            onChange={(value) =>
                              layerField(key, 'drawRatio', value)
                            }
                            error={errors[`${key}.drawRatio`]}
                            required
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <NumberField
                          label={`${label} Paper Rate ₹/KG`}
                          value={layer.rate}
                          onChange={(value) => layerField(key, 'rate', value)}
                          error={errors[`${key}.rate`]}
                          required
                        />
                      </td>
                      <td data-label="Weight/Set (KG)">
                        {format(
                          result?.layers.find((item) => item.key === key)
                            ?.weightPerSet,
                        )}
                      </td>
                      <td data-label="Cost/Set">
                        {money(
                          result?.layers.find((item) => item.key === key)
                            ?.costPerSet,
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="board-section">
          <header>
            <h3>
              <Calculator size={16} /> Costing
            </h3>
            <p>
              Conversion is optional: leave the rate at zero. Area-based
              conversion includes wastage.
            </p>
          </header>
          <div className="board-rate-grid">
            <label className="board-field">
              <span>Conversion Basis *</span>
              <select
                required
                value={state.conversionBasis}
                onChange={(event) =>
                  field(
                    'conversionBasis',
                    event.target.value as ConversionBasis,
                  )
                }
              >
                {(Object.keys(CONVERSION_OPTIONS) as ConversionBasis[]).map(
                  (basis) => (
                    <option key={basis} value={basis}>
                      {CONVERSION_OPTIONS[basis].label}
                    </option>
                  ),
                )}
              </select>
            </label>
            {numericField(
              'conversionRate',
              conversionRateLabel(state.conversionBasis),
              false,
            )}
            <label className="board-field">
              <span>Pricing Method</span>
              <select
                value={state.pricingMethod}
                onChange={(event) =>
                  setState(current => ({ ...current, pricingMethod: event.target.value as PricingMethod, pricingPercent: defaults[event.target.value as PricingMethod] }))
                }
              >
                <option value="markup">Markup %</option>
                <option value="margin">Margin %</option>
              </select>
            </label>
            {numericField(
              'pricingPercent',
              `${state.pricingMethod === 'margin' ? 'Margin' : 'Markup'} (%)`,
              false,
            )}
          </div>
        </section>
        <section className="board-section">
          <header>
            <h3>
              <Calculator size={16} /> Calculation Summary
            </h3>
            <p>
              Paper weights and costs include wastage once. Display rounding
              does not affect calculations.
            </p>
          </header>
          {!result && (
            <p className="partition-hint" role="status">
              {errors.calculation ||
                'Complete the required fields to view the summary and save a PDF.'}
            </p>
          )}
          {geometry && (
            <p className="partition-summary-context">
              {state.ply} Ply · {format(geometry.outer.length)} ×{' '}
              {format(geometry.outer.width)} × {format(geometry.outer.height)}{' '}
              mm · Cell {format(geometry.cells.length)} ×{' '}
              {format(geometry.cells.width)} mm · {geometry.counts.length} ×{' '}
              {geometry.counts.width} configuration · {geometry.totalCells}{' '}
              cells
            </p>
          )}
          <div className="board-specification-grid partition-input-grid partition-table-wrap">
            <Metric
              label="Conversion Basis"
              value={CONVERSION_OPTIONS[state.conversionBasis].label}
            />
            <Metric
              label="Conversion Rate"
              value={
                !errors.conversionRate
                  ? `${money(Number(state.conversionRate))}/${state.conversionBasis === 'kg' ? 'KG' : state.conversionBasis === 'area' ? 'm\u00b2' : 'Set'}`
                  : '\u2014'
              }
            />
            <Metric
              label="Pricing Method"
              value={state.pricingMethod === 'margin' ? 'Margin' : 'Markup'}
            />
            <Metric
              label={
                state.pricingMethod === 'margin' ? 'Margin (%)' : 'Markup (%)'
              }
              value={
                !errors.pricingPercent
                  ? `${Number(state.pricingPercent).toFixed(2)}%`
                  : '\u2014'
              }
            />
          </div>
          <div className="partition-result-grid" aria-live="polite">
            <Metric
              label="Total Strips / Set"
              value={format(geometry?.pieces.total, 0)}
            />
            <Metric
              label="Total Area / Set (m², incl. wastage)"
              value={format(result?.area.finalPerSet)}
            />
            <Metric
              label="Paper Weight / Set (KG)"
              value={format(result?.weightPerSet)}
            />
            <Metric
              label="Material Cost / Set"
              value={money(result?.materialPerSet)}
            />
            <Metric
              label="Conversion Cost / Set"
              value={money(result?.conversionPerSet)}
            />
            <Metric
              label="Total Cost / Set"
              value={money(result?.costPerSet)}
            />
            <Metric
              label="Selling Price / Set"
              value={money(result?.sellingPerSet)}
            />
            <Metric label="Quantity" value={format(result?.quantity, 0)} />
            <Metric label="Total Order Cost" value={money(result?.cost)} />
            <Metric
              label="Total Selling Value"
              value={money(result?.selling)}
            />
            <Metric label="Gross Profit" value={money(result?.profit)} />
          </div>
          <details className="partition-detail-summary board-cost-summary">
            <summary>Detailed partition, paper and order totals</summary>
            <div className="board-layer-grid partition-summary">
              <div>
                <h4>Partition Details</h4>
                <Metric label="Ply" value={`${state.ply} Ply`} />
                <Metric
                  label="Outer Size (mm)"
                  value={
                    !errors.length && !errors.width && !errors.height
                      ? `${format(Number(state.length))} × ${format(Number(state.width))} × ${format(Number(state.height))}`
                      : '—'
                  }
                />
                <Metric
                  label="Cell Configuration"
                  value={
                    geometry
                      ? `${format(Number(geometry.counts.length), 0)} × ${format(Number(geometry.counts.width), 0)}`
                      : '—'
                  }
                />
                <Metric
                  label="Actual Cell Internal Size (mm)"
                  value={
                    geometry
                      ? `${format(geometry.cells.length)} × ${format(geometry.cells.width)}`
                      : '—'
                  }
                />
                <Metric
                  label="Total Strips / Set"
                  value={format(geometry?.pieces.total, 0)}
                />
                <Metric
                  label="Quantity (sets)"
                  value={
                    !errors.quantity ? format(Number(state.quantity), 0) : '—'
                  }
                />
              </div>
              <div>
                <h4>Paper / Board</h4>
                <Metric
                  label="Base Board Area / Set (m²)"
                  value={format(result?.area.perSet, 4)}
                />
                <Metric
                  label="Base Board Area / Order (m²)"
                  value={format(result?.area.order, 4)}
                />
                <Metric
                  label="Wastage (%)"
                  value={!errors.wastage ? format(Number(state.wastage)) : '—'}
                />
                <Metric
                  label="Final Area / Set (m²)"
                  value={format(result?.area.finalPerSet)}
                />
                <Metric
                  label="Final Area / Order (m²)"
                  value={format(result?.area.finalOrder, 4)}
                />
                <Metric
                  label="Paper Weight / Set (KG)"
                  value={format(result?.weightPerSet)}
                />
                <Metric
                  label="Total Paper Weight (KG)"
                  value={format(result?.weight)}
                />
              </div>
              <div>
                <h4>Costing / Set</h4>
                <Metric
                  label="Material Cost / Set"
                  value={money(result?.materialPerSet)}
                />
                <Metric
                  label="Conversion Cost / Set"
                  value={money(result?.conversionPerSet)}
                />
                <Metric
                  label="Total Cost / Set"
                  value={money(result?.costPerSet)}
                />
                <Metric
                  label="Selling Price / Set"
                  value={money(result?.sellingPerSet)}
                />
                <Metric
                  label="Gross Profit / Set"
                  value={money(result?.profitPerSet)}
                />
              </div>
              <div>
                <h4>Order</h4>
                <Metric
                  label="Quantity (sets)"
                  value={format(result?.quantity, 0)}
                />
                <Metric
                  label="Total Material Cost"
                  value={money(result?.material)}
                />
                <Metric
                  label="Total Conversion Cost"
                  value={money(result?.conversion)}
                />
                <Metric label="Total Order Cost" value={money(result?.cost)} />
                <Metric
                  label="Total Selling Value"
                  value={money(result?.selling)}
                />
                <Metric
                  label="Total Gross Profit"
                  value={money(result?.profit)}
                />
              </div>
            </div>
            <div className="board-layer-summary-table-wrap partition-table-wrap">
              <table className="board-layer-summary-table">
                <caption>
                  Paper Layer Cost Breakdown · Order totals include quantity and
                  wastage
                </caption>
                <thead>
                  <tr>
                    <th>Layer</th>
                    <th>GSM</th>
                    <th>BF</th>
                    <th>Shade</th>
                    <th>Flute</th>
                    <th>Draw Ratio</th>
                    <th>Weight / Set (KG)</th>
                    <th>Order Weight (KG)</th>
                    <th>Rate ₹/KG</th>
                    <th>Order Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {result ? (
                    result.layers.map((row) => {
                      const layer = state.layers[row.key]
                      return (
                        <tr key={row.key}>
                          <th scope="row">{layerLabel(row.key, state.ply)}</th>
                          <td>{format(Number(layer.gsm))}</td>
                          <td>{format(Number(layer.bf))}</td>
                          <td>{layer.shade}</td>
                          <td>{isFlute(row.key) ? layer.flute : '—'}</td>
                          <td>{isFlute(row.key) ? format(row.ratio) : '—'}</td>
                          <td>{format(row.weightPerSet, 4)}</td>
                          <td>{format(row.weight)}</td>
                          <td>{money(Number(layer.rate))}</td>
                          <td>{money(row.cost)}</td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={10}>
                        Enter valid inputs to view the layer breakdown.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </details>
          <div className="board-calculator-actions partition-pdf-actions">
            <label>
              <input
                type="checkbox"
                checked={includeCosting}
                disabled={pdfBusy}
                onChange={(event) => setIncludeCosting(event.target.checked)}
              />{' '}
              Include Costing in PDF
            </label>
            <button
              type="button"
              className="board-calculator-refresh-button"
              disabled={!result || !geometry || pdfBusy}
              onClick={() => void savePdf()}
            >
              {pdfBusy ? 'Generating PDF...' : 'Save as PDF'}
            </button>
          </div>
          {pdfError && (
            <p className="board-formula-notice" role="alert">
              {pdfError}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
