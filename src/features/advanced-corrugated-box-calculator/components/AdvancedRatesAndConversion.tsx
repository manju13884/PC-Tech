import React from 'react';
import { BadgePercent } from 'lucide-react';
import AdvancedLabelInput from './AdvancedLabelInput';
import type { AdvancedNumericValue } from '../types/advancedBoxCalculatorTypes';


interface AdvancedRatesAndConversionProps {
  ratePerKg: AdvancedNumericValue; printingCharges: AdvancedNumericValue; transportCharges: AdvancedNumericValue; margin: AdvancedNumericValue;
  valueBox: number;
  onRatePerKgChange: (v: string) => void;
  onPrintingChargesChange: (v: string) => void;
  onTransportChargesChange: (v: string) => void;
  onMarginChange: (v: string) => void;
}

const AdvancedRatesAndConversion: React.FC<AdvancedRatesAndConversionProps> = ({
  ratePerKg, printingCharges, transportCharges, margin, valueBox,
  onRatePerKgChange, onPrintingChargesChange, onTransportChargesChange, onMarginChange,
}) => (
  <div>
    <h2 className="advanced-calculator-section-heading text-xs sm:text-lg font-semibold text-gray-800 mb-2">
      <BadgePercent size={16} strokeWidth={2} aria-hidden="true" />
      <span>Rates & Conversion</span>
    </h2>
    <div className="advanced-rates-conversion-grid grid grid-cols-2 sm:grid-cols-5 gap-2">
      <AdvancedLabelInput label="Rate/KG"   value={ratePerKg}        onChange={(e) => onRatePerKgChange(e.target.value)} />
      <AdvancedLabelInput label="Val/Box"   value={valueBox.toFixed(3)} onChange={() => {}} readOnly isBold calculated />
      <AdvancedLabelInput label="Printing"  value={printingCharges}  onChange={(e) => onPrintingChargesChange(e.target.value)} />
      <AdvancedLabelInput label="Transport" value={transportCharges} onChange={(e) => onTransportChargesChange(e.target.value)} />
      <AdvancedLabelInput label="Margin %"  value={margin}           onChange={(e) => onMarginChange(e.target.value)} />
    </div>
  </div>
);

export default AdvancedRatesAndConversion;
