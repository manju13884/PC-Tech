import React from 'react';
import LabelInput from './LabelInput';

type N = number | '';

interface PaperLayer { gsm: N; bf: N; }

interface PaperLayersProps {
  layers: {
    top: PaperLayer; bFlute: PaperLayer; bLiner: PaperLayer;
    cFlute: PaperLayer; cLiner: PaperLayer; aFlute: PaperLayer; aLiner: PaperLayer;
  };
  onLayerChange: (layer: string, field: 'gsm' | 'bf', value: string) => void;
}

const LayerInput: React.FC<{
  label: string; gsm: N; bf: N;
  onGsmChange: (v: string) => void;
  onBfChange: (v: string) => void;
}> = ({ label, gsm, bf, onGsmChange, onBfChange }) => (
  <div className="grid grid-cols-2 gap-2">
    <LabelInput label={`${label} GSM`} value={gsm} onChange={(e) => onGsmChange(e.target.value)} />
    <LabelInput label={`${label} BF`} value={bf} onChange={(e) => onBfChange(e.target.value)} />
  </div>
);

const PaperLayers: React.FC<PaperLayersProps> = ({ layers, onLayerChange }) => (
  <div>
    <h2 className="text-xs sm:text-lg font-semibold text-gray-800 mb-2">Paper Layers</h2>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <LayerInput label="Top"  gsm={layers.top.gsm}    bf={layers.top.bf}    onGsmChange={(v) => onLayerChange('top',    'gsm', v)} onBfChange={(v) => onLayerChange('top',    'bf', v)} />
      <LayerInput label="BF"   gsm={layers.bFlute.gsm} bf={layers.bFlute.bf} onGsmChange={(v) => onLayerChange('bFlute', 'gsm', v)} onBfChange={(v) => onLayerChange('bFlute', 'bf', v)} />
      <LayerInput label="BL"   gsm={layers.bLiner.gsm} bf={layers.bLiner.bf} onGsmChange={(v) => onLayerChange('bLiner', 'gsm', v)} onBfChange={(v) => onLayerChange('bLiner', 'bf', v)} />
      <LayerInput label="CF"   gsm={layers.cFlute.gsm} bf={layers.cFlute.bf} onGsmChange={(v) => onLayerChange('cFlute', 'gsm', v)} onBfChange={(v) => onLayerChange('cFlute', 'bf', v)} />
      <LayerInput label="CL"   gsm={layers.cLiner.gsm} bf={layers.cLiner.bf} onGsmChange={(v) => onLayerChange('cLiner', 'gsm', v)} onBfChange={(v) => onLayerChange('cLiner', 'bf', v)} />
      <LayerInput label="AF"   gsm={layers.aFlute.gsm} bf={layers.aFlute.bf} onGsmChange={(v) => onLayerChange('aFlute', 'gsm', v)} onBfChange={(v) => onLayerChange('aFlute', 'bf', v)} />
      <LayerInput label="AL"   gsm={layers.aLiner.gsm} bf={layers.aLiner.bf} onGsmChange={(v) => onLayerChange('aLiner', 'gsm', v)} onBfChange={(v) => onLayerChange('aLiner', 'bf', v)} />
    </div>
  </div>
);

export default PaperLayers;
