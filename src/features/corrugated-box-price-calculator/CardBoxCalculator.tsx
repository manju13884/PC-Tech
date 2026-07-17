import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import BoxDimensions from './BoxDimensions';
import PaperLayers from './PaperLayers';
import RatesAndConversion from './RatesAndConversion';
import {
  ceilToThreeDecimals,
  FLUTE_MULTIPLIERS,
  DEFAULT_VALUES,
  calculateDeckle,
  calculateWeightPerReem,
  calculateCostPerBox,
  calculateFinalPrice,
  PLY_LAYER_CONFIG,
} from './utils';
import type { BoxPly, PaperLayerKey } from './utils';

type N = number | '';

const CardBoxCalculator: React.FC = () => {
  // Dimensions
  const [length, setLength] = useState<N>('');
  const [breadth, setBreadth] = useState<N>('');
  const [height, setHeight] = useState<N>('');
  const [deckleSize, setDeckleSize] = useState<N>('');
  const [deckleLength, setDeckleLength] = useState<N>('');
  const [boxPly, setBoxPly] = useState<BoxPly>(3);

  // Paper Layers — pre-filled on page load
  const [topGSM, setTopGSM] = useState<N>(120);
  const [topBF, setTopBF] = useState<N>(16);
  const [bFluteGsm, setBFluteGsm] = useState<N>(120);
  const [bFluteBF, setBFluteBF] = useState<N>(16);
  const [bLinerGsm, setBLinerGsm] = useState<N>(120);
  const [bLinerBF, setBLinerBF] = useState<N>(16);
  const [cFluteGsm, setCFluteGsm] = useState<N>('');
  const [cFluteBF, setCFluteBF] = useState<N>('');
  const [cLinerGsm, setCLinerGsm] = useState<N>('');
  const [cLinerBF, setCLinerBF] = useState<N>('');
  const [aFluteGsm, setAFluteGsm] = useState<N>('');
  const [aFluteBF, setAFluteBF] = useState<N>('');
  const [aLinerGsm, setALinerGsm] = useState<N>('');
  const [aLinerBF, setALinerBF] = useState<N>('');
  const [topPr, setTopPr] = useState<N>(DEFAULT_VALUES.prices.topPr);
  const [bFlutePr, setBFlutePr] = useState<N>(DEFAULT_VALUES.prices.bFlutePr);
  const [bLinerPr, setBLinerPr] = useState<N>(DEFAULT_VALUES.prices.bLinerPr);
  const [cFlutePr, setCFlutePr] = useState<N>(DEFAULT_VALUES.prices.cFlutePr);
  const [cLinerPr, setCLinerPr] = useState<N>(DEFAULT_VALUES.prices.cLinerPr);
  const [aFlutePr, setAFlutePr] = useState<N>(DEFAULT_VALUES.prices.aFlutePr);
  const [aLinerPr, setALinerPr] = useState<N>(DEFAULT_VALUES.prices.aLinerPr);

  // Conversion — pre-filled on page load
  const [ratePerKg, setRatePerKg] = useState<N>(10);
  const [printingCharges, setPrintingCharges] = useState<N>('');
  const [transportCharges, setTransportCharges] = useState<N>('');
  const [margin, setMargin] = useState<N>(5);

  // Results
  const [totalCost, setTotalCost] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);
  const [valueBox, setValueBox] = useState<number>(0);
  const [boxWeight, setBoxWeight] = useState<number>(0);

  const n = (v: N) => (v === '' ? 0 : Number(v));

  useEffect(() => {
    const { deckleSize: newSize, deckleLength: newLength } = calculateDeckle(n(length), n(breadth), n(height));
    setDeckleSize(newSize || '');
    setDeckleLength(newLength || '');
  }, [length, breadth, height]);

  useEffect(() => {
    const wprTop = calculateWeightPerReem(n(deckleSize), n(deckleLength), n(topGSM));
    const wprBF  = calculateWeightPerReem(n(deckleSize), n(deckleLength), n(bFluteGsm), FLUTE_MULTIPLIERS.b);
    const wprBL  = calculateWeightPerReem(n(deckleSize), n(deckleLength), n(bLinerGsm));
    const wprCF  = calculateWeightPerReem(n(deckleSize), n(deckleLength), n(cFluteGsm), FLUTE_MULTIPLIERS.c);
    const wprCL  = calculateWeightPerReem(n(deckleSize), n(deckleLength), n(cLinerGsm));
    const wprAF  = calculateWeightPerReem(n(deckleSize), n(deckleLength), n(aFluteGsm), FLUTE_MULTIPLIERS.a);
    const wprAL  = calculateWeightPerReem(n(deckleSize), n(deckleLength), n(aLinerGsm));

    const layerWeights: Record<PaperLayerKey, number> = {
      top: wprTop, bFlute: wprBF, bLiner: wprBL, cFlute: wprCF,
      cLiner: wprCL, aFlute: wprAF, aLiner: wprAL,
    };
    const layerPrices: Record<PaperLayerKey, number> = {
      top: n(topPr), bFlute: n(bFlutePr), bLiner: n(bLinerPr), cFlute: n(cFlutePr),
      cLiner: n(cLinerPr), aFlute: n(aFlutePr), aLiner: n(aLinerPr),
    };
    const activeLayers = PLY_LAYER_CONFIG[boxPly];
    const totalBoard = ceilToThreeDecimals(
      activeLayers.reduce((total, layer) => total + layerWeights[layer], 0)
    );
    const bw = ceilToThreeDecimals(totalBoard);
    setBoxWeight(bw);
    setValueBox(ceilToThreeDecimals(bw * n(ratePerKg)));

    const costPerBox = calculateCostPerBox(
      activeLayers.map((layer) => ({ weight: layerWeights[layer], price: layerPrices[layer] }))
    );

    const { totalCost: newTotalCost, price: newPrice } = calculateFinalPrice(
      costPerBox, bw * n(ratePerKg), n(printingCharges), n(transportCharges), n(margin)
    );

    setTotalCost(newTotalCost);
    setPrice(newPrice);
  }, [
    deckleSize, deckleLength,
    topGSM, topBF, bFluteGsm, bFluteBF, bLinerGsm, bLinerBF,
    cFluteGsm, cFluteBF, cLinerGsm, cLinerBF,
    aFluteGsm, aFluteBF, aLinerGsm, aLinerBF,
    topPr, bFlutePr, bLinerPr, cFlutePr, cLinerPr, aFlutePr, aLinerPr,
    ratePerKg, printingCharges, transportCharges, margin, boxPly,
  ]);

  const resetAll = () => {
    setLength(''); setBreadth(''); setHeight('');
    setBoxPly(3);
    setTopGSM(120); setTopBF(16);
    setBFluteGsm(120); setBFluteBF(16);
    setBLinerGsm(120); setBLinerBF(16);
    setCFluteGsm(''); setCFluteBF('');
    setCLinerGsm(''); setCLinerBF('');
    setAFluteGsm(''); setAFluteBF('');
    setALinerGsm(''); setALinerBF('');
    setTopPr(DEFAULT_VALUES.prices.topPr);
    setBFlutePr(DEFAULT_VALUES.prices.bFlutePr);
    setBLinerPr(DEFAULT_VALUES.prices.bLinerPr);
    setCFlutePr(DEFAULT_VALUES.prices.cFlutePr);
    setCLinerPr(DEFAULT_VALUES.prices.cLinerPr);
    setAFlutePr(DEFAULT_VALUES.prices.aFlutePr);
    setALinerPr(DEFAULT_VALUES.prices.aLinerPr);
    setRatePerKg(10); setPrintingCharges('');
    setTransportCharges(''); setMargin(5);
  };

  const set = (v: string) => v === '' ? '' : Number(v) as N;

  const handleLayerChange = (layer: string, field: 'gsm' | 'bf' | 'price', value: string) => {
    const setters: Record<string, Record<'gsm' | 'bf' | 'price', (val: N) => void>> = {
      top:    { gsm: setTopGSM,    bf: setTopBF,    price: setTopPr    },
      bFlute: { gsm: setBFluteGsm, bf: setBFluteBF, price: setBFlutePr },
      bLiner: { gsm: setBLinerGsm, bf: setBLinerBF, price: setBLinerPr },
      cFlute: { gsm: setCFluteGsm, bf: setCFluteBF, price: setCFlutePr },
      cLiner: { gsm: setCLinerGsm, bf: setCLinerBF, price: setCLinerPr },
      aFlute: { gsm: setAFluteGsm, bf: setAFluteBF, price: setAFlutePr },
      aLiner: { gsm: setALinerGsm, bf: setALinerBF, price: setALinerPr },
    };
    setters[layer][field](set(value));
  };

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-lg sm:text-2xl font-bold text-blue-600">Card Box Calculator</h1>
          <button type="button" onClick={resetAll} className="calculator-refresh-button" title="Reset calculator">
            <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>

        <form className="grid grid-cols-1 gap-4 sm:gap-6">
          <BoxDimensions
            length={length} breadth={breadth} height={height}
            deckleSize={deckleSize} deckleLength={deckleLength}
            totalCost={totalCost} price={price} boxWeight={boxWeight}
            boxPly={boxPly} onBoxPlyChange={setBoxPly}
            onLengthChange={(v) => setLength(set(v))}
            onBreadthChange={(v) => setBreadth(set(v))}
            onHeightChange={(v) => setHeight(set(v))}
            onDeckleSizeChange={(v) => setDeckleSize(set(v))}
            onDeckleLengthChange={(v) => setDeckleLength(set(v))}
          />

          <section className="bg-white p-2 sm:p-4 rounded shadow">
            <PaperLayers
              layers={{
                top:    { gsm: topGSM,    bf: topBF,    price: topPr    },
                bFlute: { gsm: bFluteGsm, bf: bFluteBF, price: bFlutePr },
                bLiner: { gsm: bLinerGsm, bf: bLinerBF, price: bLinerPr },
                cFlute: { gsm: cFluteGsm, bf: cFluteBF, price: cFlutePr },
                cLiner: { gsm: cLinerGsm, bf: cLinerBF, price: cLinerPr },
                aFlute: { gsm: aFluteGsm, bf: aFluteBF, price: aFlutePr },
                aLiner: { gsm: aLinerGsm, bf: aLinerBF, price: aLinerPr },
              }}
              boxPly={boxPly}
              onLayerChange={handleLayerChange}
            />
          </section>

          <section className="bg-white p-2 sm:p-4 rounded shadow">
            <RatesAndConversion
              ratePerKg={ratePerKg} printingCharges={printingCharges}
              transportCharges={transportCharges} margin={margin} valueBox={valueBox}
              onRatePerKgChange={(v) => setRatePerKg(set(v))}
              onPrintingChargesChange={(v) => setPrintingCharges(set(v))}
              onTransportChargesChange={(v) => setTransportCharges(set(v))}
              onMarginChange={(v) => setMargin(set(v))}
            />
          </section>
        </form>
      </div>
    </div>
  );
};

export default CardBoxCalculator;
