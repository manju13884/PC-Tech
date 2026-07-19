import { useMemo, useState } from 'react'
import { BadgePercent, Layers3, RotateCcw, Ruler, WalletCards } from 'lucide-react'
import { BOARD_FLUTE_DRAW_RATIOS, BOARD_LAYER_LABELS, BOARD_PLY_LAYER_CONFIG } from './boardCalculatorConfig'
import {
  calculateCorrugatedBoardPrice,
  createInitialBoardCalculatorState,
} from './boardCalculatorLogic'
import type { BoardLayerKey, BoardPly } from './boardCalculatorTypes'
import './corrugated-board-price-calculator.css'

interface NumberFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  placeholder?: string
  readOnly?: boolean
  calculated?: boolean
}

function NumberField({ label, value, onChange, error, placeholder, readOnly = false, calculated = false }: NumberFieldProps) {
  return (
    <label className="board-field">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        readOnly={readOnly}
        className={calculated ? 'board-calculated-input' : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <small role="alert">{error}</small>}
    </label>
  )
}

export default function CorrugatedBoardPriceCalculator() {
  const [state, setState] = useState(createInitialBoardCalculatorState)
  const activeLayers = BOARD_PLY_LAYER_CONFIG[state.boardPly]
  const result = useMemo(() => calculateCorrugatedBoardPrice(state), [state])

  const setField = (field: 'lengthMm' | 'widthMm' | 'quantity' | 'conversionRatePerKg' | 'printingCostPerBoard' | 'transportCostPerBoard' | 'marginPercent', value: string) => {
    setState((current) => ({ ...current, [field]: value }))
  }

  const setLayerField = (layer: BoardLayerKey, field: 'gsm' | 'burstingFactor' | 'paperRatePerKg', value: string) => {
    setState((current) => ({
      ...current,
      layers: { ...current.layers, [layer]: { ...current.layers[layer], [field]: value } },
    }))
  }

  const reset = () => {
    setState(createInitialBoardCalculatorState())
  }

  return (
    <div className="pc-corrugated-board-calculator">
      <div className="board-calculator-surface">
      <div className="board-calculator-actions">
        <button type="button" className="board-calculator-refresh-button" onClick={reset} title="Reset calculator"><RotateCcw size={16} strokeWidth={2} aria-hidden="true" /><span>Reset</span></button>
      </div>

      <section className="board-section">
        <header><h3><Ruler size={16} /> Board Specifications</h3><p>Enter the finished flat-board dimensions and required quantity.</p></header>
        <div className="board-specification-grid">
          <label className="board-field">
            <span>Board Ply</span>
            <select value={state.boardPly} onChange={(event) => setState((current) => ({ ...current, boardPly: Number(event.target.value) as BoardPly }))}>
              <option value={3}>3 Ply</option><option value={5}>5 Ply</option><option value={7}>7 Ply</option>
            </select>
          </label>
          <NumberField label="Board Length (mm)" value={state.lengthMm} onChange={(value) => setField('lengthMm', value)} placeholder="Enter length" />
          <NumberField label="Board Width (mm)" value={state.widthMm} onChange={(value) => setField('widthMm', value)} placeholder="Enter width" />
          <NumberField label="Quantity" value={state.quantity} onChange={(value) => setField('quantity', value)} placeholder="Enter quantity" />
          <NumberField label="Board Area (m²)" value={result ? result.boardAreaSqM.toFixed(3) : ''} onChange={() => undefined} readOnly calculated />
        </div>
      </section>

      <section className="board-section">
        <header className="board-paper-layers-header">
          <h3><Layers3 size={16} /> Paper Layers</h3>
          <p>
            Configure the paper composition of the board.{' '}
            <em>Available Configuration: {state.boardPly}-Ply Board ({activeLayers.length} Layers)</em>
          </p>
        </header>
        <div className="board-layer-grid">
          {activeLayers.map((layer) => (
            <div key={layer} className="board-layer-card">
              <NumberField label={`${BOARD_LAYER_LABELS[layer]} Paper Price`} value={state.layers[layer].paperRatePerKg} onChange={(value) => setLayerField(layer, 'paperRatePerKg', value)} />
              <div className="board-layer-input-pair">
                <NumberField label={`${BOARD_LAYER_LABELS[layer]} GSM`} value={state.layers[layer].gsm} onChange={(value) => setLayerField(layer, 'gsm', value)} />
                <NumberField label={`${BOARD_LAYER_LABELS[layer]} BF`} value={state.layers[layer].burstingFactor} onChange={(value) => setLayerField(layer, 'burstingFactor', value)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="board-section">
        <header><h3><BadgePercent size={16} /> Rates &amp; Conversion</h3><p>Conversion follows the existing weight-based rate method. Printing and transport are optional per-board charges.</p></header>
        <div className="board-rate-grid">
          <NumberField label="Conversion Rate / kg (₹)" value={state.conversionRatePerKg} onChange={(value) => setField('conversionRatePerKg', value)} />
          <NumberField label="Conversion Cost / Board (₹)" value={result ? result.conversionCost.toFixed(3) : ''} onChange={() => undefined} readOnly calculated />
          <NumberField label="Printing / Board (₹)" value={state.printingCostPerBoard} onChange={(value) => setField('printingCostPerBoard', value)} />
          <NumberField label="Transport / Board (₹)" value={state.transportCostPerBoard} onChange={(value) => setField('transportCostPerBoard', value)} />
          <NumberField label="Markup (%)" value={state.marginPercent} onChange={(value) => setField('marginPercent', value)} />
        </div>
      </section>

      <section className="board-section">
        <header><h3><WalletCards size={16} /> Cost Summary</h3><p>Per-board and quantity totals using active layers only.</p></header>
        <div className="board-cost-summary" aria-live="polite">
          <h4>Board Information</h4>
          <div className="board-information-grid">
            <div><span>Board Length</span><strong>{state.lengthMm ? `${Number(state.lengthMm).toFixed(3)} mm` : '—'}</strong></div>
            <div><span>Board Width</span><strong>{state.widthMm ? `${Number(state.widthMm).toFixed(3)} mm` : '—'}</strong></div>
            <div><span>Board Area</span><strong>{result ? `${result.boardAreaSqM.toFixed(3)} m²` : '—'}</strong></div>
          </div>

          <h4>Paper Requirement by Layer</h4>
          <div className="board-layer-summary-table-wrap">
            <table className="board-layer-summary-table">
              <thead><tr><th>Layer</th><th>GSM</th><th>Draw Ratio</th><th>Paper Rate/KG</th><th>Weight / Board (kg)</th><th>Total Weight (kg)</th><th>Total Paper Price</th></tr></thead>
              <tbody>
                {result ? result.layers.map((layer) => (
                  <tr key={layer.key}>
                    <td>{BOARD_LAYER_LABELS[layer.key]}</td>
                    <td>{Number(state.layers[layer.key].gsm).toFixed(0)}</td>
                    <td>{BOARD_FLUTE_DRAW_RATIOS[layer.key]?.toFixed(2) ?? '—'}</td>
                    <td>₹{Number(state.layers[layer.key].paperRatePerKg).toFixed(2)}</td>
                    <td>{layer.weightWithWastageKg.toFixed(3)}</td>
                    <td>{(layer.weightWithWastageKg * Number(state.quantity)).toFixed(3)}</td>
                    <td>₹{(layer.paperCost * Number(state.quantity)).toFixed(2)}</td>
                  </tr>
                )) : <tr><td colSpan={7} className="board-summary-empty">Enter valid board dimensions and quantity to view the layer summary.</td></tr>}
              </tbody>
            </table>
          </div>

          <h4>Cost Summary</h4>
          <div className="board-summary-grid">
            <div className="board-summary-card board-summary-weight"><span>Board Weight</span><strong>{result ? `${result.boardWeightKg.toFixed(3)} kg` : '—'}</strong></div>
            <div className="board-summary-card board-summary-total"><span>Total Cost / Board</span><strong>{result ? `₹${result.totalCost.toFixed(3)}` : '—'}</strong></div>
            <div className="board-summary-card board-summary-selling"><span>Selling Price / Board</span><strong>{result ? `₹${result.sellingPricePerBoard.toFixed(3)}` : '—'}</strong></div>
          </div>
          <div className="board-summary-primary-grid">
            <div className="board-summary-primary board-summary-paper-weight"><span>Grand Total Paper Weight</span><strong>{result ? `${result.totalPaperWeight.toFixed(3)} kg` : '—'}</strong></div>
            <div className="board-summary-primary board-summary-paper-cost"><span>Total Paper Cost</span><strong>{result ? `₹${(result.totalPaperCost * Number(state.quantity)).toFixed(2)}` : '—'}</strong></div>
          </div>
          <div className="board-summary-grid board-summary-details">
            <div className="board-summary-card"><span>Paper Cost / Board</span><strong>{result ? `₹${result.totalPaperCost.toFixed(3)}` : '—'}</strong></div>
            <div className="board-summary-card"><span>Conversion Cost</span><strong>{result ? `₹${result.conversionCost.toFixed(3)}` : '—'}</strong></div>
            <div className="board-summary-card"><span>Other Costs</span><strong>{result ? `₹${result.otherCosts.toFixed(3)}` : '—'}</strong></div>
            <div className="board-summary-card"><span>Markup</span><strong>{result ? `₹${result.markupAmount.toFixed(3)}` : '—'}</strong></div>
            <div className="board-summary-card"><span>Total Cost for Quantity</span><strong>{result ? `₹${result.totalCostForQuantity.toFixed(3)}` : '—'}</strong></div>
            <div className="board-summary-card board-summary-selling"><span>Total Selling Price</span><strong>{result ? `₹${result.totalSellingPrice.toFixed(3)}` : '—'}</strong></div>
          </div>
        </div>
      </section>
      </div>
    </div>
  )
}
