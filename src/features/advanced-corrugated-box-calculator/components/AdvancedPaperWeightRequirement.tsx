import { useEffect, useMemo, useState } from 'react'
import { BadgeIndianRupee, Layers2, Layers3, Package, Scale, Waves, Weight } from 'lucide-react'
import { calculateAdvancedPaperWeight } from '../calculations/advancedPaperWeightCalculator'
import type { AdvancedNumericValue } from '../types/advancedBoxCalculatorTypes'
import type { AdvancedPaperWeightPly } from '../types/advancedPaperWeightTypes'
import {
  validateAdvancedPaperWeightInput,
  validateAdvancedQuantity,
} from '../validation/advancedPaperWeightValidation'

interface AdvancedPaperWeightRequirementProps {
  length: AdvancedNumericValue
  breadth: AdvancedNumericValue
  height: AdvancedNumericValue
  topGsm: AdvancedNumericValue
  fluteGsm: AdvancedNumericValue
  linerGsm: AdvancedNumericValue
  flute1Gsm: AdvancedNumericValue
  liner1Gsm: AdvancedNumericValue
  topRatePerKg: AdvancedNumericValue
  fluteRatePerKg: AdvancedNumericValue
  linerRatePerKg: AdvancedNumericValue
  flute1RatePerKg: AdvancedNumericValue
  liner1RatePerKg: AdvancedNumericValue
  boxWeight: number
}

const numericValue = (value: AdvancedNumericValue): number => value === '' ? 0 : Number(value)

export default function AdvancedPaperWeightRequirement({
  length,
  breadth,
  height,
  topGsm,
  fluteGsm,
  linerGsm,
  flute1Gsm,
  liner1Gsm,
  topRatePerKg,
  fluteRatePerKg,
  linerRatePerKg,
  flute1RatePerKg,
  liner1RatePerKg,
  boxWeight,
}: AdvancedPaperWeightRequirementProps) {
  const [quantity, setQuantity] = useState(() => boxWeight < 1 ? '1000' : '500')
  const [quantityTouched, setQuantityTouched] = useState(false)
  const [quantityEdited, setQuantityEdited] = useState(false)
  const quantityError = quantityTouched || quantity !== '' ? validateAdvancedQuantity(quantity) : null
  const ply: AdvancedPaperWeightPly = flute1Gsm !== '' || liner1Gsm !== '' ? 5 : 3

  useEffect(() => {
    if (!quantityEdited) {
      setQuantity(boxWeight < 1 ? '1000' : '500')
    }
  }, [boxWeight, quantityEdited])

  const result = useMemo(() => {
    if (quantityError) return null

    const input = validateAdvancedPaperWeightInput({
      ply,
      lengthMm: numericValue(length),
      breadthMm: numericValue(breadth),
      heightMm: numericValue(height),
      quantity: Number(quantity),
      topGsm: numericValue(topGsm),
      fluteGsm: numericValue(fluteGsm),
      linerGsm: numericValue(linerGsm),
      flute1Gsm: numericValue(flute1Gsm),
      liner1Gsm: numericValue(liner1Gsm),
    })

    return input ? calculateAdvancedPaperWeight({
      ...input,
      topRatePerKg: numericValue(topRatePerKg),
      fluteRatePerKg: numericValue(fluteRatePerKg),
      linerRatePerKg: numericValue(linerRatePerKg),
      flute1RatePerKg: numericValue(flute1RatePerKg),
      liner1RatePerKg: numericValue(liner1RatePerKg),
    }) : null
  }, [
    breadth,
    flute1Gsm,
    flute1RatePerKg,
    fluteGsm,
    fluteRatePerKg,
    height,
    length,
    liner1Gsm,
    liner1RatePerKg,
    linerGsm,
    linerRatePerKg,
    ply,
    quantity,
    quantityError,
    topGsm,
    topRatePerKg,
  ])

  const missingInputMessage = !quantityError && quantity !== '' && !result
    ? `Complete all required dimensions and ${ply}-ply GSM values to view results.`
    : null

  return (
    <section className="advanced-paper-weight-section">
      <header className="advanced-paper-weight-header">
        <div className="advanced-paper-weight-heading-copy">
          <h2 className="advanced-calculator-section-heading">
            <Scale size={16} strokeWidth={2} aria-hidden="true" />
            <span>Paper Weight Requirement</span>
          </h2>
          <p>Enter the total box quantity to calculate the paper weight required for each layer.</p>
        </div>
        <span className="advanced-paper-weight-badge">
          <Layers3 size={14} strokeWidth={2} aria-hidden="true" />
          <span>{ply}-Ply Active</span>
        </span>
      </header>

      <div className="advanced-paper-weight-controls">
        <label className="text-xs" htmlFor="advanced-total-box-quantity">Total Box Quantity</label>
        <div className="advanced-paper-weight-input-row">
          <input
            id="advanced-total-box-quantity"
            className="text-xs"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            required
            value={quantity}
            aria-invalid={Boolean(quantityError)}
            aria-describedby={quantityError ? 'advanced-total-box-quantity-error' : undefined}
            placeholder="Enter total quantity"
            onBlur={() => setQuantityTouched(true)}
            onChange={(event) => {
              setQuantityEdited(true)
              setQuantity(event.target.value)
            }}
          />
          <span>boxes</span>
        </div>
        {quantityError && (
          <p id="advanced-total-box-quantity-error" className="advanced-paper-weight-error" role="alert">
            {quantityError}
          </p>
        )}
        {missingInputMessage && <p className="advanced-paper-weight-error" role="status">{missingInputMessage}</p>}
      </div>

      {result && (
        <div className="advanced-paper-weight-results" aria-live="polite">
          <h3 className="advanced-paper-weight-subsection-title">Sheet Information</h3>
          <div className="advanced-paper-weight-sheet-summary">
            <div className="advanced-sheet-result-card">
              <p>Sheet Width</p>
              <strong>{result.sheetWidthCm.toFixed(3)} <span>cm</span></strong>
            </div>
            <div className="advanced-sheet-result-card">
              <p>Sheet Length</p>
              <strong>{result.sheetLengthCm.toFixed(3)} <span>cm</span></strong>
            </div>
            <div className="advanced-sheet-result-card">
              <p>Sheet Area</p>
              <strong>{result.sheetAreaSqM.toFixed(3)} <span>m<sup>2</sup></span></strong>
            </div>
          </div>

          <h3 className="advanced-paper-weight-subsection-title">Paper Requirement by Layer</h3>
          <div className="advanced-paper-weight-table-wrap">
            <table className="advanced-paper-weight-table">
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>GSM</th>
                  <th>Draw Ratio</th>
                  <th>Paper Rate/KG</th>
                  <th>Weight / Box (kg)</th>
                  <th>Total Weight (kg)</th>
                  <th>Total Paper Price</th>
                </tr>
              </thead>
              <tbody>
                {result.layerResults.map((layer) => (
                  <tr key={layer.key}>
                    <td>{layer.label}</td>
                    <td>{layer.gsm}</td>
                    <td>{layer.drawRatio?.toFixed(2) ?? '—'}</td>
                    <td>{layer.ratePerKg === null ? '—' : `₹${layer.ratePerKg.toFixed(2)}`}</td>
                    <td>{layer.weightPerBoxKg.toFixed(3)}</td>
                    <td>{layer.totalQuantityWeightKg.toFixed(3)}</td>
                    <td>{layer.totalPaperPrice === null ? '—' : `₹${layer.totalPaperPrice.toFixed(2)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.totalPaperCost === null && (
            <p className="advanced-paper-cost-message" role="status">
              Enter valid paper rates to calculate total paper cost.
            </p>
          )}

          <h3 className="advanced-paper-weight-subsection-title">Paper Requirement Summary</h3>
          <div className="advanced-paper-weight-totals">
            {ply === 5 && (
              <div>
                <span className="advanced-paper-weight-result-label"><Waves size={14} aria-hidden="true" /> Combined Flute Total</span>
                <strong>{result.groupedFluteWeightKg.toFixed(3)} kg</strong>
              </div>
            )}
            {ply === 5 && (
              <div>
                <span className="advanced-paper-weight-result-label"><Layers2 size={14} aria-hidden="true" /> Combined Liner Total</span>
                <strong>{result.groupedLinerWeightKg.toFixed(3)} kg</strong>
              </div>
            )}
            <div className="advanced-paper-weight-box-total">
              <span className="advanced-paper-weight-result-label"><Package size={14} aria-hidden="true" /> Total Box Weight</span>
              <strong>{result.totalBoxWeightKg.toFixed(3)} kg</strong>
            </div>
          </div>
          <div className="advanced-paper-weight-primary-totals">
            <div className="advanced-paper-weight-grand-total">
              <span className="advanced-paper-weight-result-label"><Weight size={15} aria-hidden="true" /> Grand Total Paper Weight</span>
              <strong>{result.grandTotalWeightKg.toFixed(3)} kg</strong>
            </div>
            <div className="advanced-paper-cost-total">
              <span className="advanced-paper-weight-result-label"><BadgeIndianRupee size={15} aria-hidden="true" /> Total Paper Cost</span>
              <strong>{result.totalPaperCost === null ? '—' : `₹${result.totalPaperCost.toFixed(2)}`}</strong>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
