import React from 'react';
import { Layers3 } from 'lucide-react';
import AdvancedLabelInput from './AdvancedLabelInput';
import { PRODUCTION_PLY_LAYER_CONFIG } from '../types/advancedBoxCalculatorTypes';
import type { AdvancedNumericValue, ProductionBoxPly, ProductionLayerKey } from '../types/advancedBoxCalculatorTypes';


interface AdvancedPaperLayer { gsm: AdvancedNumericValue; bf: AdvancedNumericValue; price: AdvancedNumericValue; }

interface AdvancedPaperLayersProps {
  layers: {
    top: AdvancedPaperLayer; bFlute: AdvancedPaperLayer; bLiner: AdvancedPaperLayer;
    cFlute: AdvancedPaperLayer; cLiner: AdvancedPaperLayer; aFlute: AdvancedPaperLayer; aLiner: AdvancedPaperLayer;
  };
  boxPly: ProductionBoxPly;
  onLayerChange: (layer: string, field: 'gsm' | 'bf' | 'price', value: string) => void;
}

const AdvancedLayerInput: React.FC<{
  label: string; gsm: AdvancedNumericValue; bf: AdvancedNumericValue; price: AdvancedNumericValue;
  onGsmChange: (v: string) => void;
  onBfChange: (v: string) => void;
  onPriceChange: (v: string) => void;
}> = ({ label, gsm, bf, price, onGsmChange, onBfChange, onPriceChange }) => (
  <div className="advanced-paper-layer-block flex flex-col gap-2">
    <AdvancedLabelInput label={`${label} Paper Price`} value={price} onChange={(e) => onPriceChange(e.target.value)} />
    <div className="grid grid-cols-2 gap-2">
      <AdvancedLabelInput label={`${label} GSM`} value={gsm} onChange={(e) => onGsmChange(e.target.value)} />
      <AdvancedLabelInput label={`${label} BF`} value={bf} onChange={(e) => onBfChange(e.target.value)} />
    </div>
  </div>
);

const PRODUCTION_LAYER_LABELS: Record<ProductionLayerKey, string> = {
  top: 'Top', bFlute: 'BF', bLiner: 'BL', cFlute: 'CF', cLiner: 'CL', aFlute: 'AF', aLiner: 'AL',
};

const AdvancedPaperLayers: React.FC<AdvancedPaperLayersProps> = ({ layers, boxPly, onLayerChange }) => (
  <div>
    <header className="advanced-paper-layers-header">
      <h2 className="advanced-calculator-section-heading text-xs sm:text-lg font-semibold text-gray-800 mb-2">
        <Layers3 size={16} strokeWidth={2} aria-hidden="true" />
        <span>Paper Layers</span>
      </h2>
      <p className="advanced-calculator-section-subtitle">
        Configure the paper composition of the box.{' '}
        <em>Available Configuration: {boxPly}-Ply Box ({PRODUCTION_PLY_LAYER_CONFIG[boxPly].length} Layers)</em>
      </p>
    </header>
    <div className="advanced-paper-layers-grid grid grid-cols-2 sm:grid-cols-4 gap-2">
      {PRODUCTION_PLY_LAYER_CONFIG[boxPly].map((key) => <AdvancedLayerInput key={key} label={PRODUCTION_LAYER_LABELS[key]} gsm={layers[key].gsm} bf={layers[key].bf} price={layers[key].price} onGsmChange={(v) => onLayerChange(key, 'gsm', v)} onBfChange={(v) => onLayerChange(key, 'bf', v)} onPriceChange={(v) => onLayerChange(key, 'price', v)} />)}
    </div>
  </div>
);

export default AdvancedPaperLayers;
