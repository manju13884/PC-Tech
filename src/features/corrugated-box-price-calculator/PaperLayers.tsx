import React from 'react';
import { Layers3 } from 'lucide-react';
import LabelInput from './LabelInput';

type N = number | '';

interface PaperLayer { gsm: N; bf: N; price: N; }

interface PaperLayersProps {
  layers: {
    top: PaperLayer; bFlute: PaperLayer; bLiner: PaperLayer;
    cFlute: PaperLayer; cLiner: PaperLayer; aFlute: PaperLayer; aLiner: PaperLayer;
  };
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

const PaperLayers: React.FC<PaperLayersProps> = ({ layers, onLayerChange }) => (
  <div>
    <header className="paper-layers-header">
      <h2 className="calculator-section-heading text-xs sm:text-lg font-semibold text-gray-800 mb-2">
        <Layers3 size={16} strokeWidth={2} aria-hidden="true" />
        <span>Paper Layers</span>
      </h2>
      <p className="calculator-section-subtitle">3 Layers : 3 ply box, 5 Layers : 5 ply box, 7 Layers : 7 ply box</p>
    </header>
    <div className="paper-layers-grid grid grid-cols-2 sm:grid-cols-4 gap-2">
      <LayerInput label="Top" gsm={layers.top.gsm} bf={layers.top.bf} price={layers.top.price} onGsmChange={(v) => onLayerChange('top', 'gsm', v)} onBfChange={(v) => onLayerChange('top', 'bf', v)} onPriceChange={(v) => onLayerChange('top', 'price', v)} />
      <LayerInput label="BF" gsm={layers.bFlute.gsm} bf={layers.bFlute.bf} price={layers.bFlute.price} onGsmChange={(v) => onLayerChange('bFlute', 'gsm', v)} onBfChange={(v) => onLayerChange('bFlute', 'bf', v)} onPriceChange={(v) => onLayerChange('bFlute', 'price', v)} />
      <LayerInput label="BL" gsm={layers.bLiner.gsm} bf={layers.bLiner.bf} price={layers.bLiner.price} onGsmChange={(v) => onLayerChange('bLiner', 'gsm', v)} onBfChange={(v) => onLayerChange('bLiner', 'bf', v)} onPriceChange={(v) => onLayerChange('bLiner', 'price', v)} />
      <LayerInput label="CF" gsm={layers.cFlute.gsm} bf={layers.cFlute.bf} price={layers.cFlute.price} onGsmChange={(v) => onLayerChange('cFlute', 'gsm', v)} onBfChange={(v) => onLayerChange('cFlute', 'bf', v)} onPriceChange={(v) => onLayerChange('cFlute', 'price', v)} />
      <LayerInput label="CL" gsm={layers.cLiner.gsm} bf={layers.cLiner.bf} price={layers.cLiner.price} onGsmChange={(v) => onLayerChange('cLiner', 'gsm', v)} onBfChange={(v) => onLayerChange('cLiner', 'bf', v)} onPriceChange={(v) => onLayerChange('cLiner', 'price', v)} />
      <LayerInput label="AF" gsm={layers.aFlute.gsm} bf={layers.aFlute.bf} price={layers.aFlute.price} onGsmChange={(v) => onLayerChange('aFlute', 'gsm', v)} onBfChange={(v) => onLayerChange('aFlute', 'bf', v)} onPriceChange={(v) => onLayerChange('aFlute', 'price', v)} />
      <LayerInput label="AL" gsm={layers.aLiner.gsm} bf={layers.aLiner.bf} price={layers.aLiner.price} onGsmChange={(v) => onLayerChange('aLiner', 'gsm', v)} onBfChange={(v) => onLayerChange('aLiner', 'bf', v)} onPriceChange={(v) => onLayerChange('aLiner', 'price', v)} />
    </div>
  </div>
);

export default PaperLayers;
