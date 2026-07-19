import { useMemo } from 'react'
import { BadgeIndianRupee, Layers2, Layers3, Package, Scale, Waves, Weight } from 'lucide-react'
import { calculateAdvancedPaperWeight } from '../calculations/advancedPaperWeightCalculator'
import type { AdvancedNumericValue } from '../types/advancedBoxCalculatorTypes'
import type { AdvancedPaperWeightPly } from '../types/advancedPaperWeightTypes'
import type { ProductionBoxPly } from '../types/advancedBoxCalculatorTypes'
import {
  validateAdvancedPaperWeightInput,
  validateAdvancedQuantity,
} from '../validation/advancedPaperWeightValidation'

interface AdvancedPaperWeightRequirementProps {
  boxPly: ProductionBoxPly
  length: AdvancedNumericValue
  breadth: AdvancedNumericValue
  height: AdvancedNumericValue
  topGsm: AdvancedNumericValue
  fluteGsm: AdvancedNumericValue
  linerGsm: AdvancedNumericValue
  flute1Gsm: AdvancedNumericValue
  liner1Gsm: AdvancedNumericValue
  flute2Gsm: AdvancedNumericValue
  liner2Gsm: AdvancedNumericValue
  topRatePerKg: AdvancedNumericValue
  fluteRatePerKg: AdvancedNumericValue
  linerRatePerKg: AdvancedNumericValue
  flute1RatePerKg: AdvancedNumericValue
  liner1RatePerKg: AdvancedNumericValue
  flute2RatePerKg: AdvancedNumericValue
  liner2RatePerKg: AdvancedNumericValue
  quantity: string
}

const numericValue = (value: AdvancedNumericValue): number => value === '' ? 0 : Number(value)

export default function AdvancedPaperWeightRequirement({
  boxPly,
  length,
  breadth,
  height,
  topGsm,
  fluteGsm,
  linerGsm,
  flute1Gsm,
  liner1Gsm,
  flute2Gsm,
  liner2Gsm,
  topRatePerKg,
  fluteRatePerKg,
  linerRatePerKg,
  flute1RatePerKg,
  liner1RatePerKg,
  flute2RatePerKg,
  liner2RatePerKg,
  quantity,
}: AdvancedPaperWeightRequirementProps) {
  const quantityError = validateAdvancedQuantity(quantity)
  const ply: AdvancedPaperWeightPly = boxPly

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
      flute2Gsm: numericValue(flute2Gsm),
      liner2Gsm: numericValue(liner2Gsm),
    })

    return input ? calculateAdvancedPaperWeight({
      ...input,
      topRatePerKg: numericValue(topRatePerKg),
      fluteRatePerKg: numericValue(fluteRatePerKg),
      linerRatePerKg: numericValue(linerRatePerKg),
      flute1RatePerKg: numericValue(flute1RatePerKg),
      liner1RatePerKg: numericValue(liner1RatePerKg),
      flute2RatePerKg: numericValue(flute2RatePerKg),
      liner2RatePerKg: numericValue(liner2RatePerKg),
    }) : null
  }, [
    breadth,
    flute1Gsm,
    flute1RatePerKg,
    flute2Gsm,
    flute2RatePerKg,
    fluteGsm,
    fluteRatePerKg,
    height,
    length,
    liner1Gsm,
    liner1RatePerKg,
    liner2Gsm,
    liner2RatePerKg,
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
          <p>Paper weight required for each layer using the quantity entered in Box Specifications.</p>
        </div>
        <span className="advanced-paper-weight-badge">
          <Layers3 size={14} strokeWidth={2} aria-hidden="true" />
          <span>{ply}-Ply Active</span>
        </span>
      </header>

      {missingInputMessage && <p className="advanced-paper-weight-error" role="status">{missingInputMessage}</p>}

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
            {ply >= 5 && (
              <div>
                <span className="advanced-paper-weight-result-label"><Waves size={14} aria-hidden="true" /> Combined Flute Total</span>
                <strong>{result.groupedFluteWeightKg.toFixed(3)} kg</strong>
              </div>
            )}
            {ply >= 5 && (
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
