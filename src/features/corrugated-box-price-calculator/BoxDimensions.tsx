import React from 'react';
import { Ruler } from 'lucide-react';
import LabelInput from './LabelInput';

type N = number | '';

interface BoxDimensionsProps {
  length: N; breadth: N; height: N;
  deckleSize: N; deckleLength: N;
  totalCost: number; price: number; boxWeight: number;
  onLengthChange: (v: string) => void;
  onBreadthChange: (v: string) => void;
  onHeightChange: (v: string) => void;
  onDeckleSizeChange: (v: string) => void;
  onDeckleLengthChange: (v: string) => void;
}

const BoxDimensions: React.FC<BoxDimensionsProps> = ({
  length, breadth, height, deckleSize, deckleLength,
  totalCost, price, boxWeight,
  onLengthChange, onBreadthChange, onHeightChange,
  onDeckleSizeChange, onDeckleLengthChange,
}) => {
  const fmt = (v: N) => v !== '' ? Number(v).toFixed(2) : '';

  return (
    <section className="box-specifications-section bg-white p-4 sm:p-4 rounded shadow">
      <header className="box-specifications-header">
        <h2 className="calculator-section-heading text-xs sm:text-lg font-semibold text-gray-800 mb-2">
          <Ruler size={16} strokeWidth={2} aria-hidden="true" />
          <span>Box Specifications</span>
        </h2>
        <p>Enter the finished box outer dimensions to calculate weight and price.</p>
      </header>

      <div className="box-specifications-inputs">
        <LabelInput label="Length (mm)" value={length} placeholder="Enter length" onChange={(e) => onLengthChange(e.target.value)} />
        <LabelInput label="Breadth (mm)" value={breadth} placeholder="Enter breadth" onChange={(e) => onBreadthChange(e.target.value)} />
        <LabelInput label="Height (mm)" value={height} placeholder="Enter height" onChange={(e) => onHeightChange(e.target.value)} />
        <LabelInput label="SIZE (cm)" value={fmt(deckleSize)} onChange={(e) => onDeckleSizeChange(e.target.value)} isBold />
        <LabelInput label="DECKLE L (cm)" value={fmt(deckleLength)} onChange={(e) => onDeckleLengthChange(e.target.value)} isBold />
      </div>

      <div className="box-specifications-results" aria-live="polite" aria-atomic="true">
        <div className="box-result-card">
          <p>Box Weight</p>
          <strong>{boxWeight.toFixed(3)} kg</strong>
        </div>
        <div className="box-result-card">
          <p>Total Cost</p>
          <strong>₹{totalCost.toFixed(2)}</strong>
        </div>
        <div className="box-result-card selling-price">
          <p>Selling Price</p>
          <strong>₹{price.toFixed(2)}</strong>
        </div>
      </div>
    </section>
  );
};

export default BoxDimensions;
