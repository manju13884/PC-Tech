import React from 'react';
import { Layers3 } from 'lucide-react';
import LabelInput from './LabelInput';
import { PLY_LAYER_CONFIG } from './utils';
import type { BoxPly, PaperLayerKey } from './utils';

type N = number | '';

interface PaperLayer { gsm: N; bf: N; price: N; }

interface PaperLayersProps {
  layers: {
    top: PaperLayer; bFlute: PaperLayer; bLiner: PaperLayer;
    cFlute: PaperLayer; cLiner: PaperLayer; aFlute: PaperLayer; aLiner: PaperLayer;
  };
  boxPly: BoxPly;
  onLayerChange: (layer: string, field: 'gsm' | 'bf' | 'price', value: string) => void;
}

const LayerInput: React.FC<{
  label: string; gsm: N; bf: N; price: N;
  onGsmChange: (v: string) => void;
  onBfChange: (v: string) => void;
  onPriceChange: (v: string) => void;
}> = ({ label, gsm, bf, price, onGsmChange, onBfChange, onPriceChange }) => (
  <div className="paper-layer-block flex flex-col gap-2">
    <LabelInput label={`${label} Paper Price`} value={price} onChange={(e) => onPriceChange(e.target.value)} />
    <div className="grid grid-cols-2 gap-2">
      <LabelInput label={`${label} GSM`} value={gsm} onChange={(e) => onGsmChange(e.target.value)} />
      <LabelInput label={`${label} BF`} value={bf} onChange={(e) => onBfChange(e.target.value)} />
    </div>
  </div>
);

const LAYER_LABELS: Record<PaperLayerKey, string> = {
  top: 'Top', bFlute: 'BF', bLiner: 'BL', cFlute: 'CF',
  cLiner: 'CL', aFlute: 'AF', aLiner: 'AL',
};

const PaperLayers: React.FC<PaperLayersProps> = ({ layers, boxPly, onLayerChange }) => (
  <div>
    <header className="paper-layers-header">
      <h2 className="calculator-section-heading text-xs sm:text-lg font-semibold text-gray-800 mb-2">
        <Layers3 size={16} strokeWidth={2} aria-hidden="true" />
        <span>Paper Layers</span>
      </h2>
      <p className="calculator-section-subtitle">
        Configure the paper composition of the box.{' '}
        <em>Available Configuration: {boxPly}-Ply Box ({PLY_LAYER_CONFIG[boxPly].length} Layers)</em>
      </p>
    </header>
    <div className="paper-layers-grid grid grid-cols-2 sm:grid-cols-4 gap-2">
      {PLY_LAYER_CONFIG[boxPly].map((layerKey) => (
        <LayerInput
          key={layerKey}
          label={LAYER_LABELS[layerKey]}
          gsm={layers[layerKey].gsm}
          bf={layers[layerKey].bf}
          price={layers[layerKey].price}
          onGsmChange={(v) => onLayerChange(layerKey, 'gsm', v)}
          onBfChange={(v) => onLayerChange(layerKey, 'bf', v)}
          onPriceChange={(v) => onLayerChange(layerKey, 'price', v)}
        />
      ))}
    </div>
  </div>
);

export default PaperLayers;
