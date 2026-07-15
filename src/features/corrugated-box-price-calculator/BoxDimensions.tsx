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
    <section className="bg-white p-4 sm:p-4 rounded shadow">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
        <div className="sm:col-span-2">
          <h2 className="calculator-section-heading text-xs sm:text-lg font-semibold text-gray-800 mb-2">
            <Ruler size={16} strokeWidth={2} aria-hidden="true" />
            <span>Box Dimensions</span>
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <LabelInput label="Length" value={length} onChange={(e) => onLengthChange(e.target.value)} />
            <LabelInput label="Breadth" value={breadth} onChange={(e) => onBreadthChange(e.target.value)} />
            <LabelInput label="Height" value={height} onChange={(e) => onHeightChange(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2 items-start">
            <div className="calculated-result bg-white p-2 rounded border border-gray-200">
              <p className="text-xs text-gray-600">Total Cost</p>
              <p className="text-lg font-bold text-red-700">{totalCost.toFixed(2)}</p>
            </div>
            <div className="calculated-result bg-white p-2 rounded border border-gray-200">
              <p className="text-xs text-gray-600">Box Weight</p>
              <p className="text-lg font-bold text-blue-700">{boxWeight.toFixed(3)} kg</p>
            </div>
            <div className="calculated-result bg-white p-2 rounded border border-gray-200">
              <p className="text-xs text-gray-600">Price</p>
              <p className="text-lg font-bold text-green-700">{price.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="sm:col-span-1">
          <div className="space-y-2">
            <LabelInput label="SIZE" value={fmt(deckleSize)} onChange={(e) => onDeckleSizeChange(e.target.value)} isBold calculated />
            <LabelInput label="DECKLE L" value={fmt(deckleLength)} onChange={(e) => onDeckleLengthChange(e.target.value)} isBold calculated />
          </div>
        </div>
      </div>
    </section>
  );
};

export default BoxDimensions;
