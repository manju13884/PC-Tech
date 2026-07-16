import React from 'react';
import { BadgeIndianRupee, ReceiptIndianRupee, Ruler, Weight } from 'lucide-react';
import AdvancedLabelInput from './AdvancedLabelInput';
import type { AdvancedNumericValue } from '../types/advancedBoxCalculatorTypes';


interface AdvancedBoxDimensionsProps {
  length: AdvancedNumericValue; breadth: AdvancedNumericValue; height: AdvancedNumericValue;
  deckleSize: AdvancedNumericValue; deckleLength: AdvancedNumericValue;
  totalCost: number; price: number; boxWeight: number;
  onLengthChange: (v: string) => void;
  onBreadthChange: (v: string) => void;
  onHeightChange: (v: string) => void;
  onDeckleSizeChange: (v: string) => void;
  onDeckleLengthChange: (v: string) => void;
}

const AdvancedBoxDimensions: React.FC<AdvancedBoxDimensionsProps> = ({
  length, breadth, height, deckleSize, deckleLength,
  totalCost, price, boxWeight,
  onLengthChange, onBreadthChange, onHeightChange,
  onDeckleSizeChange, onDeckleLengthChange,
}) => {
  const fmt = (v: AdvancedNumericValue) => v !== '' ? Number(v).toFixed(2) : '';

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
