import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import AdvancedBoxDimensions from './AdvancedBoxDimensions';
import AdvancedPaperLayers from './AdvancedPaperLayers';
import AdvancedPaperWeightRequirement from './AdvancedPaperWeightRequirement';
import AdvancedRatesAndConversion from './AdvancedRatesAndConversion';
import {
  advancedCeilToThreeDecimals,
  ADVANCED_FLUTE_MULTIPLIERS,
  ADVANCED_DEFAULT_VALUES,
  calculateAdvancedDeckle,
  calculateAdvancedWeightPerReem,
  calculateAdvancedCostPerBox,
  calculateAdvancedFinalPrice,
} from '../calculations/advancedBoxCalculatorEngine';
import { PRODUCTION_PLY_LAYER_CONFIG } from '../types/advancedBoxCalculatorTypes';
import type { AdvancedNumericValue, ProductionBoxPly, ProductionLayerKey } from '../types/advancedBoxCalculatorTypes';
import { normalizeAdvancedNumber, parseAdvancedNumericValue } from '../validation/advancedBoxCalculatorValidation';

const AdvancedCardBoxCalculator: React.FC = () => {
  // Dimensions
  const [length, setLength] = useState<AdvancedNumericValue>('');
  const [breadth, setBreadth] = useState<AdvancedNumericValue>('');
  const [height, setHeight] = useState<AdvancedNumericValue>('');
  const [deckleSize, setDeckleSize] = useState<AdvancedNumericValue>('');
  const [deckleLength, setDeckleLength] = useState<AdvancedNumericValue>('');
  const [boxPly, setBoxPly] = useState<ProductionBoxPly>(3);
  const [totalBoxQuantity, setTotalBoxQuantity] = useState('500');

  // Paper Layers — pre-filled on page load
  const [topGSM, setTopGSM] = useState<AdvancedNumericValue>(120);
  const [topBF, setTopBF] = useState<AdvancedNumericValue>(16);
  const [bFluteGsm, setBFluteGsm] = useState<AdvancedNumericValue>(120);
  const [bFluteBF, setBFluteBF] = useState<AdvancedNumericValue>(16);
  const [bLinerGsm, setBLinerGsm] = useState<AdvancedNumericValue>(120);
  const [bLinerBF, setBLinerBF] = useState<AdvancedNumericValue>(16);
  const [cFluteGsm, setCFluteGsm] = useState<AdvancedNumericValue>('');
  const [cFluteBF, setCFluteBF] = useState<AdvancedNumericValue>('');
  const [cLinerGsm, setCLinerGsm] = useState<AdvancedNumericValue>('');
  const [cLinerBF, setCLinerBF] = useState<AdvancedNumericValue>('');
  const [aFluteGsm, setAFluteGsm] = useState<AdvancedNumericValue>('');
  const [aFluteBF, setAFluteBF] = useState<AdvancedNumericValue>('');
  const [aLinerGsm, setALinerGsm] = useState<AdvancedNumericValue>('');
  const [aLinerBF, setALinerBF] = useState<AdvancedNumericValue>('');
  const [topPr, setTopPr] = useState<AdvancedNumericValue>(ADVANCED_DEFAULT_VALUES.prices.topPr);
  const [bFlutePr, setBFlutePr] = useState<AdvancedNumericValue>(ADVANCED_DEFAULT_VALUES.prices.bFlutePr);
  const [bLinerPr, setBLinerPr] = useState<AdvancedNumericValue>(ADVANCED_DEFAULT_VALUES.prices.bLinerPr);
  const [cFlutePr, setCFlutePr] = useState<AdvancedNumericValue>(ADVANCED_DEFAULT_VALUES.prices.cFlutePr);
  const [cLinerPr, setCLinerPr] = useState<AdvancedNumericValue>(ADVANCED_DEFAULT_VALUES.prices.cLinerPr);
  const [aFlutePr, setAFlutePr] = useState<AdvancedNumericValue>(ADVANCED_DEFAULT_VALUES.prices.aFlutePr);
  const [aLinerPr, setALinerPr] = useState<AdvancedNumericValue>(ADVANCED_DEFAULT_VALUES.prices.aLinerPr);

  // Conversion — pre-filled on page load
  const [ratePerKg, setRatePerKg] = useState<AdvancedNumericValue>(10);
  const [printingCharges, setPrintingCharges] = useState<AdvancedNumericValue>('');
  const [transportCharges, setTransportCharges] = useState<AdvancedNumericValue>('');
  const [margin, setMargin] = useState<AdvancedNumericValue>(5);

  // Results
  const [totalCost, setTotalCost] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);
  const [valueBox, setValueBox] = useState<number>(0);
  const [boxWeight, setBoxWeight] = useState<number>(0);

  const n = normalizeAdvancedNumber;

  useEffect(() => {
    const { deckleSize: newSize, deckleLength: newLength } = calculateAdvancedDeckle(n(length), n(breadth), n(height));
    setDeckleSize(newSize || '');
    setDeckleLength(newLength || '');
  }, [length, breadth, height]);

  useEffect(() => {
    const wprTop = calculateAdvancedWeightPerReem(n(deckleSize), n(deckleLength), n(topGSM));
    const wprBF  = calculateAdvancedWeightPerReem(n(deckleSize), n(deckleLength), n(bFluteGsm), ADVANCED_FLUTE_MULTIPLIERS.b);
    const wprBL  = calculateAdvancedWeightPerReem(n(deckleSize), n(deckleLength), n(bLinerGsm));
    const wprCF  = calculateAdvancedWeightPerReem(n(deckleSize), n(deckleLength), n(cFluteGsm), ADVANCED_FLUTE_MULTIPLIERS.c);
    const wprCL  = calculateAdvancedWeightPerReem(n(deckleSize), n(deckleLength), n(cLinerGsm));
    const wprAF  = calculateAdvancedWeightPerReem(n(deckleSize), n(deckleLength), n(aFluteGsm), ADVANCED_FLUTE_MULTIPLIERS.a);
    const wprAL  = calculateAdvancedWeightPerReem(n(deckleSize), n(deckleLength), n(aLinerGsm));

    const layerWeights: Record<ProductionLayerKey, number> = { top: wprTop, bFlute: wprBF, bLiner: wprBL, cFlute: wprCF, cLiner: wprCL, aFlute: wprAF, aLiner: wprAL };
    const layerPrices: Record<ProductionLayerKey, number> = { top: n(topPr), bFlute: n(bFlutePr), bLiner: n(bLinerPr), cFlute: n(cFlutePr), cLiner: n(cLinerPr), aFlute: n(aFlutePr), aLiner: n(aLinerPr) };
    const activeLayers = PRODUCTION_PLY_LAYER_CONFIG[boxPly];
    const totalBoard = advancedCeilToThreeDecimals(activeLayers.reduce((total, layer) => total + layerWeights[layer], 0));
    const bw = advancedCeilToThreeDecimals(totalBoard);
    setBoxWeight(bw);
    setValueBox(advancedCeilToThreeDecimals(bw * n(ratePerKg)));

    const costPerBox = calculateAdvancedCostPerBox(activeLayers.map((layer) => ({ weight: layerWeights[layer], price: layerPrices[layer] })));

    const { totalCost: newTotalCost, price: newPrice } = calculateAdvancedFinalPrice(
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
    setTotalBoxQuantity('500');
    setTopGSM(120); setTopBF(16);
    setBFluteGsm(120); setBFluteBF(16);
    setBLinerGsm(120); setBLinerBF(16);
    setCFluteGsm(''); setCFluteBF('');
    setCLinerGsm(''); setCLinerBF('');
    setAFluteGsm(''); setAFluteBF('');
    setALinerGsm(''); setALinerBF('');
    setTopPr(ADVANCED_DEFAULT_VALUES.prices.topPr);
    setBFlutePr(ADVANCED_DEFAULT_VALUES.prices.bFlutePr);
    setBLinerPr(ADVANCED_DEFAULT_VALUES.prices.bLinerPr);
    setCFlutePr(ADVANCED_DEFAULT_VALUES.prices.cFlutePr);
    setCLinerPr(ADVANCED_DEFAULT_VALUES.prices.cLinerPr);
    setAFlutePr(ADVANCED_DEFAULT_VALUES.prices.aFlutePr);
    setALinerPr(ADVANCED_DEFAULT_VALUES.prices.aLinerPr);
    setRatePerKg(10); setPrintingCharges('');
    setTransportCharges(''); setMargin(5);
  };

  const set = parseAdvancedNumericValue;

  const handleLayerChange = (layer: string, field: 'gsm' | 'bf' | 'price', value: string) => {
    const setters: Record<string, Record<'gsm' | 'bf' | 'price', (val: AdvancedNumericValue) => void>> = {
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
          <button type="button" onClick={resetAll} className="advanced-calculator-refresh-button" title="Reset calculator">
            <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>

        <form className="grid grid-cols-1 gap-4 sm:gap-6">
          <AdvancedBoxDimensions
            length={length} breadth={breadth} height={height}
            deckleSize={deckleSize} deckleLength={deckleLength}
            totalCost={totalCost} price={price} boxWeight={boxWeight}
            boxPly={boxPly} onBoxPlyChange={setBoxPly}
            totalBoxQuantity={totalBoxQuantity} onTotalBoxQuantityChange={setTotalBoxQuantity}
            onLengthChange={(v) => setLength(set(v))}
            onBreadthChange={(v) => setBreadth(set(v))}
            onHeightChange={(v) => setHeight(set(v))}
            onDeckleSizeChange={(v) => setDeckleSize(set(v))}
            onDeckleLengthChange={(v) => setDeckleLength(set(v))}
          />

          <section className="bg-white p-2 sm:p-4 rounded shadow">
            <AdvancedPaperLayers
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
            <AdvancedRatesAndConversion
              ratePerKg={ratePerKg} printingCharges={printingCharges}
              transportCharges={transportCharges} margin={margin} valueBox={valueBox}
              onRatePerKgChange={(v) => setRatePerKg(set(v))}
              onPrintingChargesChange={(v) => setPrintingCharges(set(v))}
              onTransportChargesChange={(v) => setTransportCharges(set(v))}
              onMarginChange={(v) => setMargin(set(v))}
            />
          </section>

          <AdvancedPaperWeightRequirement
            boxPly={boxPly}
            length={length}
            breadth={breadth}
            height={height}
            topGsm={topGSM}
            fluteGsm={bFluteGsm}
            linerGsm={bLinerGsm}
            flute1Gsm={cFluteGsm}
            liner1Gsm={cLinerGsm}
            flute2Gsm={aFluteGsm}
            liner2Gsm={aLinerGsm}
            topRatePerKg={topPr}
            fluteRatePerKg={bFlutePr}
            linerRatePerKg={bLinerPr}
            flute1RatePerKg={cFlutePr}
            liner1RatePerKg={cLinerPr}
            flute2RatePerKg={aFlutePr}
            liner2RatePerKg={aLinerPr}
            quantity={totalBoxQuantity}
          />
        </form>
      </div>
    </div>
  );
};

export default AdvancedCardBoxCalculator;
