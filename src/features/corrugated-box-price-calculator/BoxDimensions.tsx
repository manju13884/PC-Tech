import React, { useId } from 'react';
import { BadgeIndianRupee, ReceiptIndianRupee, Ruler, Weight } from 'lucide-react';
import LabelInput from './LabelInput';
import type { BoxPly } from './utils';

type N = number | '';

interface BoxDimensionsProps {
  length: N; breadth: N; height: N;
  deckleSize: N; deckleLength: N;
  totalCost: number; price: number; boxWeight: number;
  boxPly: BoxPly;
  onBoxPlyChange: (ply: BoxPly) => void;
  onLengthChange: (v: string) => void;
  onBreadthChange: (v: string) => void;
  onHeightChange: (v: string) => void;
  onDeckleSizeChange: (v: string) => void;
  onDeckleLengthChange: (v: string) => void;
}

const BoxDimensions: React.FC<BoxDimensionsProps> = ({
  length, breadth, height, deckleSize, deckleLength,
  totalCost, price, boxWeight,
  boxPly, onBoxPlyChange,
  onLengthChange, onBreadthChange, onHeightChange,
  onDeckleSizeChange, onDeckleLengthChange,
}) => {
  const fmt = (v: N) => v !== '' ? Number(v).toFixed(2) : '';
  const boxPlyId = useId();

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
        <div className="box-ply-select-field flex flex-col gap-1">
          <label htmlFor={boxPlyId} className="text-xs text-gray-700">Box Ply</label>
          <select
            id={boxPlyId}
            value={boxPly}
            onChange={(event) => onBoxPlyChange(Number(event.target.value) as BoxPly)}
            className="px-2 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value={3}>3 Ply</option>
            <option value={5}>5 Ply</option>
            <option value={7}>7 Ply</option>
          </select>
        </div>
        <LabelInput label="Length (mm)" value={length} placeholder="Enter length" onChange={(e) => onLengthChange(e.target.value)} />
        <LabelInput label="Breadth (mm)" value={breadth} placeholder="Enter breadth" onChange={(e) => onBreadthChange(e.target.value)} />
        <LabelInput label="Height (mm)" value={height} placeholder="Enter height" onChange={(e) => onHeightChange(e.target.value)} />
        <LabelInput label="SIZE (cm)" value={fmt(deckleSize)} onChange={(e) => onDeckleSizeChange(e.target.value)} isBold />
        <LabelInput label="DECKLE L (cm)" value={fmt(deckleLength)} onChange={(e) => onDeckleLengthChange(e.target.value)} isBold />
      </div>

      <div className="box-specifications-results" aria-live="polite" aria-atomic="true">
        <div className="box-result-card">
          <p><Weight size={14} aria-hidden="true" /> Box Weight</p>
          <strong>{boxWeight.toFixed(3)} kg</strong>
        </div>
        <div className="box-result-card">
          <p><ReceiptIndianRupee size={14} aria-hidden="true" /> Total Cost</p>
          <strong>₹{totalCost.toFixed(2)}</strong>
        </div>
        <div className="box-result-card selling-price">
          <p><BadgeIndianRupee size={14} aria-hidden="true" /> Selling Price</p>
          <strong>₹{price.toFixed(2)}</strong>
        </div>
      </div>
    </section>
  );
};

export default BoxDimensions;
