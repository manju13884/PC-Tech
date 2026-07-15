import React from 'react';
import { BadgePercent } from 'lucide-react';
import LabelInput from './LabelInput';

type N = number | '';

interface RatesAndConversionProps {
  ratePerKg: N; printingCharges: N; transportCharges: N; margin: N;
  valueBox: number;
  onRatePerKgChange: (v: string) => void;
  onPrintingChargesChange: (v: string) => void;
  onTransportChargesChange: (v: string) => void;
  onMarginChange: (v: string) => void;
}

const RatesAndConversion: React.FC<RatesAndConversionProps> = ({
  ratePerKg, printingCharges, transportCharges, margin, valueBox,
  onRatePerKgChange, onPrintingChargesChange, onTransportChargesChange, onMarginChange,
}) => (
  <div>
    <h2 className="calculator-section-heading text-xs sm:text-lg font-semibold text-gray-800 mb-2">
      <BadgePercent size={16} strokeWidth={2} aria-hidden="true" />
      <span>Rates & Conversion</span>
    </h2>
    <div className="rates-conversion-grid grid grid-cols-2 sm:grid-cols-5 gap-2">
      <LabelInput label="Rate/KG"   value={ratePerKg}        onChange={(e) => onRatePerKgChange(e.target.value)} />
      <LabelInput label="Val/Box"   value={valueBox.toFixed(3)} onChange={() => {}} readOnly isBold calculated />
      <LabelInput label="Printing"  value={printingCharges}  onChange={(e) => onPrintingChargesChange(e.target.value)} />
      <LabelInput label="Transport" value={transportCharges} onChange={(e) => onTransportChargesChange(e.target.value)} />
      <LabelInput label="Margin %"  value={margin}           onChange={(e) => onMarginChange(e.target.value)} />
    </div>
  </div>
);

export default RatesAndConversion;
