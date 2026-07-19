import React, { useId } from 'react';
import { BadgeIndianRupee, ReceiptIndianRupee, Ruler, Weight } from 'lucide-react';
import AdvancedLabelInput from './AdvancedLabelInput';
import type { AdvancedNumericValue, ProductionBoxPly } from '../types/advancedBoxCalculatorTypes';
import { validateAdvancedQuantity } from '../validation/advancedPaperWeightValidation';


interface AdvancedBoxDimensionsProps {
  length: AdvancedNumericValue; breadth: AdvancedNumericValue; height: AdvancedNumericValue;
  deckleSize: AdvancedNumericValue; deckleLength: AdvancedNumericValue;
  totalCost: number; price: number; boxWeight: number;
  boxPly: ProductionBoxPly;
  onBoxPlyChange: (ply: ProductionBoxPly) => void;
  totalBoxQuantity: string;
  onTotalBoxQuantityChange: (quantity: string) => void;
  onLengthChange: (v: string) => void;
  onBreadthChange: (v: string) => void;
  onHeightChange: (v: string) => void;
  onDeckleSizeChange: (v: string) => void;
  onDeckleLengthChange: (v: string) => void;
}

const AdvancedBoxDimensions: React.FC<AdvancedBoxDimensionsProps> = ({
  length, breadth, height, deckleSize, deckleLength,
  totalCost, price, boxWeight,
  boxPly, onBoxPlyChange,
  totalBoxQuantity, onTotalBoxQuantityChange,
  onLengthChange, onBreadthChange, onHeightChange,
  onDeckleSizeChange, onDeckleLengthChange,
}) => {
  const fmt = (v: AdvancedNumericValue) => v !== '' ? Number(v).toFixed(2) : '';
  const boxPlyId = useId();
  const totalBoxQuantityId = useId();
  const totalBoxQuantityError = validateAdvancedQuantity(totalBoxQuantity);

  return (
    <section className="advanced-box-specifications-section bg-white p-4 sm:p-4 rounded shadow">
      <header className="advanced-box-specifications-header">
        <h2 className="advanced-calculator-section-heading text-xs sm:text-lg font-semibold text-gray-800 mb-2">
          <Ruler size={16} strokeWidth={2} aria-hidden="true" />
          <span>Box Specifications</span>
        </h2>
        <p>Enter the finished box outer dimensions to calculate weight and price.</p>
      </header>

      <div className="advanced-box-specifications-inputs">
        <div className="advanced-box-ply-select-field flex flex-col gap-1">
          <label htmlFor={boxPlyId} className="text-xs text-gray-700">Box Ply</label>
          <select id={boxPlyId} value={boxPly} onChange={(event) => onBoxPlyChange(Number(event.target.value) as ProductionBoxPly)} className="px-2 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
            <option value={3}>3 Ply</option><option value={5}>5 Ply</option><option value={7}>7 Ply</option>
          </select>
        </div>
        <div className="advanced-total-box-quantity-field flex flex-col gap-1">
          <label htmlFor={totalBoxQuantityId} className="text-xs text-gray-700">Total Box Quantity</label>
          <input
            id={totalBoxQuantityId}
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            required
            value={totalBoxQuantity}
            aria-invalid={Boolean(totalBoxQuantityError)}
            aria-describedby={totalBoxQuantityError ? `${totalBoxQuantityId}-error` : undefined}
            placeholder="Enter total quantity"
            onChange={(event) => onTotalBoxQuantityChange(event.target.value)}
            className="px-2 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
          {totalBoxQuantityError && (
            <p id={`${totalBoxQuantityId}-error`} className="advanced-paper-weight-error" role="alert">
              {totalBoxQuantityError}
            </p>
          )}
        </div>
        <AdvancedLabelInput label="Length (mm)" value={length} placeholder="Enter length" onChange={(e) => onLengthChange(e.target.value)} />
        <AdvancedLabelInput label="Breadth (mm)" value={breadth} placeholder="Enter breadth" onChange={(e) => onBreadthChange(e.target.value)} />
        <AdvancedLabelInput label="Height (mm)" value={height} placeholder="Enter height" onChange={(e) => onHeightChange(e.target.value)} />
        <AdvancedLabelInput label="SIZE (cm)" value={fmt(deckleSize)} onChange={(e) => onDeckleSizeChange(e.target.value)} isBold />
        <AdvancedLabelInput label="DECKLE L (cm)" value={fmt(deckleLength)} onChange={(e) => onDeckleLengthChange(e.target.value)} isBold />
      </div>

      <div className="advanced-box-specifications-results" aria-live="polite" aria-atomic="true">
        <div className="advanced-box-result-card">
          <p><Weight size={14} aria-hidden="true" /> Box Weight</p>
          <strong>{boxWeight.toFixed(3)} kg</strong>
        </div>
        <div className="advanced-box-result-card">
          <p><ReceiptIndianRupee size={14} aria-hidden="true" /> Total Cost</p>
          <strong>₹{totalCost.toFixed(2)}</strong>
        </div>
        <div className="advanced-box-result-card advanced-selling-price">
          <p><BadgeIndianRupee size={14} aria-hidden="true" /> Selling Price</p>
          <strong>₹{price.toFixed(2)}</strong>
        </div>
      </div>
    </section>
  );
};

export default AdvancedBoxDimensions;
