import { useEffect, useMemo, useState } from 'react'
import type { SalesOrderLineItem } from '../../../salesOrderService'
import type { EligiblePaperItem, PaperCostInputs, PaperCostResult } from '../types/paperPurchaseRequest'
import {
  calculatePaperCost,
  createInitialPaperCostInputs,
} from '../utils/paperCostCalculations'
import { validatePaperCostInputs } from '../utils/paperCostValidation'

interface Props {
  item: SalesOrderLineItem
  configuration: EligiblePaperItem
  onResultChange: (lineItemId: string, result: PaperCostResult | null) => void
}

const formatNumber = (value: number, digits = 3) => (
  Number.isFinite(value)
    ? value.toLocaleString('en-IN', { maximumFractionDigits: digits })
    : '—'
)

const isPositive = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0
const isNonNegative = (value: string) => Number.isFinite(Number(value)) && Number(value) >= 0

export default function PaperCostEstimation({ item, configuration, onResultChange }: Props) {
  const [inputs, setInputs] = useState<PaperCostInputs>(
    () => createInitialPaperCostInputs(configuration.defaultPly, item.quantity),
  )
  const errors = useMemo(
    () => validatePaperCostInputs(configuration.productType, inputs),
    [configuration.productType, inputs],
  )
  const result = useMemo(
    () => calculatePaperCost(configuration.productType, inputs),
    [configuration.productType, inputs],
  )
  const isBox = configuration.productType === 'BOX'

  useEffect(() => {
    onResultChange(item.line_item_id, result)
  }, [item.line_item_id, onResultChange, result])

  const setField = (field: keyof Omit<PaperCostInputs, 'layers'>, value: string) => {
    setInputs((current) => ({ ...current, [field]: value }))
  }
  const setLayerField = (
    index: number,
    field: 'paperType' | 'otherPaperType' | 'gsm' | 'bf' | 'paperPricePerKg' | 'drawRatio',
    value: string,
  ) => {
    setInputs((current) => ({
      ...current,
      layers: current.layers.map((layer, layerIndex) => (
        layerIndex === index ? { ...layer, [field]: value } : layer
      )),
    }))
  }
  const fieldError = (valid: boolean, message: string) => valid ? '' : message

  return (
    <section className={`paper-estimation-card ${isBox ? 'is-box-product' : 'is-flat-product'}`}>
      <div className="paper-calculator-top-row">
        <div className="paper-calculator-section paper-dimensions-section">
          <h5>1. {isBox ? 'Box Dimensions' : 'Board/Sheet Dimensions'}</h5>
          <div className="paper-estimation-fields">
          <label className="paper-half-width-field paper-dimension-compact paper-dimension-narrow">
            <span>Length (mm)</span>
            <input className={!inputs.lengthMm || isPositive(inputs.lengthMm) ? '' : 'is-invalid'} type="number" min="0" value={inputs.lengthMm} onChange={(event) => setField('lengthMm', event.target.value)} />
            {inputs.lengthMm && <small>{fieldError(isPositive(inputs.lengthMm), 'Length must be greater than zero.')}</small>}
          </label>
          <label className="paper-half-width-field paper-dimension-compact">
            <span>Breadth (mm)</span>
            <input className={!inputs.breadthMm || isPositive(inputs.breadthMm) ? '' : 'is-invalid'} type="number" min="0" value={inputs.breadthMm} onChange={(event) => setField('breadthMm', event.target.value)} />
            {inputs.breadthMm && <small>{fieldError(isPositive(inputs.breadthMm), 'Breadth must be greater than zero.')}</small>}
          </label>
          {isBox && (
            <label className="paper-half-width-field paper-dimension-compact paper-dimension-narrow">
              <span>Height (mm)</span>
              <input className={!inputs.heightMm || isPositive(inputs.heightMm) ? '' : 'is-invalid'} type="number" min="0" value={inputs.heightMm} onChange={(event) => setField('heightMm', event.target.value)} />
              {inputs.heightMm && <small>{fieldError(isPositive(inputs.heightMm), 'Height must be greater than zero.')}</small>}
            </label>
          )}
          <label className="paper-half-width-field paper-wide-field">
            <span>Calculation Quantity</span>
            <input className={isPositive(inputs.calculationQuantity) ? '' : 'is-invalid'} type="number" min="1" value={inputs.calculationQuantity} onChange={(event) => setField('calculationQuantity', event.target.value)} />
            <small>{fieldError(isPositive(inputs.calculationQuantity), 'Quantity must be greater than zero.')}</small>
          </label>
          <label className={`paper-half-width-field ${isBox ? 'paper-ply-compact' : ''}`}>
            <span>{isBox ? 'Box Ply' : 'Board/Sheet Ply'}</span>
            <input value={configuration.defaultPly} readOnly />
          </label>
          {result && isBox && (
            <>
              <label className="paper-half-width-field paper-result-compact paper-size-compact"><span>Size (cm)</span><input value={formatNumber(result.sizeCm ?? 0)} readOnly /></label>
              <label className="paper-half-width-field paper-result-compact"><span>Deckle (cm)</span><input value={formatNumber(result.deckleCm ?? 0)} readOnly /></label>
            </>
          )}
          {result && !isBox && (
            <label className="paper-half-width-field">
              <span>Area per Board/Sheet (m²)</span>
              <input value={formatNumber(result.areaSqM, 6)} readOnly />
            </label>
          )}
          </div>
        </div>

        <div className="paper-calculator-section paper-other-inputs">
          <h5>2. Other Inputs</h5>
          <div className="paper-estimation-fields">
            <label className="paper-half-width-field">
              <span>Wastage (%)</span>
              <input className={isNonNegative(inputs.wastagePercent) ? '' : 'is-invalid'} type="number" min="0" step="0.1" value={inputs.wastagePercent} onChange={(event) => setField('wastagePercent', event.target.value)} />
              <small>{fieldError(isNonNegative(inputs.wastagePercent), 'Wastage cannot be negative.')}</small>
            </label>
          </div>
        </div>
      </div>

      <div className="paper-calculator-section paper-layer-section">
        <h5>3. Paper Layers</h5>
        <div className="paper-layer-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Layer</th><th>Paper Type</th><th>GSM</th><th>BF</th><th>Rate (₹/Kg)</th>
                <th>Base Weight</th><th>Wastage</th><th>Total Weight</th><th>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {inputs.layers.map((layer, index) => {
                const layerResult = result?.layers[index]
                return (
                  <tr key={layer.key}>
                    <td data-label="Layer">{layer.label}</td>
                    <td data-label="Paper Type">
                      <div className="paper-type-control">
                        <select value={layer.paperType} onChange={(event) => setLayerField(index, 'paperType', event.target.value)}>
                          <option value="GYT">GYT</option>
                          <option value="Natural">Natural</option>
                          <option value="White">White</option>
                          <option value="Others">Others</option>
                        </select>
                        {layer.paperType === 'Others' && (
                          <input
                            className="paper-type-other"
                            value={layer.otherPaperType}
                            placeholder="Enter paper type"
                            aria-label={`${layer.label} other paper type`}
                            onChange={(event) => setLayerField(index, 'otherPaperType', event.target.value)}
                          />
                        )}
                      </div>
                    </td>
                    <td data-label="GSM"><input className={isPositive(layer.gsm) ? '' : 'is-invalid'} type="number" min="1" value={layer.gsm} onChange={(event) => setLayerField(index, 'gsm', event.target.value)} /></td>
                    <td data-label="BF"><input type="number" min="0" value={layer.bf} onChange={(event) => setLayerField(index, 'bf', event.target.value)} /></td>
                    <td data-label="Rate (₹/Kg)"><input className={isNonNegative(layer.paperPricePerKg) ? '' : 'is-invalid'} type="number" min="0" step="0.01" value={layer.paperPricePerKg} onChange={(event) => setLayerField(index, 'paperPricePerKg', event.target.value)} /></td>
                    <td data-label="Base Weight" className="is-calculated">{layerResult ? `${formatNumber(layerResult.baseWeightKg)} kg` : '—'}</td>
                    <td data-label="Wastage" className="is-calculated">{layerResult ? `${formatNumber(layerResult.wastageWeightKg)} kg` : '—'}</td>
                    <td data-label="Total Weight" className="is-calculated">{layerResult ? `${formatNumber(layerResult.totalRequirementKg)} kg` : '—'}</td>
                    <td data-label="Total Cost" className="is-calculated">{layerResult ? `₹${formatNumber(layerResult.totalPaperCost, 2)}` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {errors.length > 0 && (
          <ul className="paper-validation-summary">
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        )}
      </div>

    </section>
  )
}
