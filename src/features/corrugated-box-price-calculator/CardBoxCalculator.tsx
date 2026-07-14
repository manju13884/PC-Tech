import React, { useEffect, useState } from 'react';
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
} from './utils';

type N = number | '';

const CardBoxCalculator: React.FC = () => {
  // Dimensions
  const [length, setLength] = useState<N>('');
  const [breadth, setBreadth] = useState<N>('');
  const [height, setHeight] = useState<N>('');
  const [deckleSize, setDeckleSize] = useState<N>('');
  const [deckleLength, setDeckleLength] = useState<N>('');

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

    const totalBoard = ceilToThreeDecimals(wprTop + wprBF + wprBL + wprCF + wprCL + wprAF + wprAL);
    const bw = ceilToThreeDecimals(totalBoard);
    setBoxWeight(bw);
    setValueBox(ceilToThreeDecimals(bw * n(ratePerKg)));

    const costPerBox = calculateCostPerBox(
      wprTop, wprBF, wprBL, wprCF, wprCL, wprAF, wprAL,
      DEFAULT_VALUES.prices.topPr, DEFAULT_VALUES.prices.bFlutePr, DEFAULT_VALUES.prices.bLinerPr,
      DEFAULT_VALUES.prices.cFlutePr, DEFAULT_VALUES.prices.cLinerPr, DEFAULT_VALUES.prices.aFlutePr, DEFAULT_VALUES.prices.aLinerPr
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
    ratePerKg, printingCharges, transportCharges, margin,
  ]);

  const resetAll = () => {
    setLength(''); setBreadth(''); setHeight('');
    setTopGSM(120); setTopBF(16);
    setBFluteGsm(120); setBFluteBF(16);
    setBLinerGsm(120); setBLinerBF(16);
    setCFluteGsm(''); setCFluteBF('');
    setCLinerGsm(''); setCLinerBF('');
    setAFluteGsm(''); setAFluteBF('');
    setALinerGsm(''); setALinerBF('');
    setRatePerKg(10); setPrintingCharges('');
    setTransportCharges(''); setMargin(5);
  };

  const set = (v: string) => v === '' ? '' : Number(v) as N;

  const handleLayerChange = (layer: string, field: 'gsm' | 'bf', value: string) => {
    const setters: Record<string, Record<'gsm' | 'bf', (val: N) => void>> = {
      top:    { gsm: setTopGSM,    bf: setTopBF    },
      bFlute: { gsm: setBFluteGsm, bf: setBFluteBF },
      bLiner: { gsm: setBLinerGsm, bf: setBLinerBF },
      cFlute: { gsm: setCFluteGsm, bf: setCFluteBF },
      cLiner: { gsm: setCLinerGsm, bf: setCLinerBF },
      aFlute: { gsm: setAFluteGsm, bf: setAFluteBF },
      aLiner: { gsm: setALinerGsm, bf: setALinerBF },
    };
    setters[layer][field](set(value));
  };

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-lg sm:text-2xl font-bold text-blue-600">Card Box Calculator</h1>
          <button onClick={resetAll} className="px-3 py-1 text-xs sm:text-sm text-red-600 font-semibold rounded hover:bg-red-50" title="Refresh">↻</button>
        </div>

        <form className="grid grid-cols-1 gap-4 sm:gap-6">
          <BoxDimensions
            length={length} breadth={breadth} height={height}
            deckleSize={deckleSize} deckleLength={deckleLength}
            totalCost={totalCost} price={price} boxWeight={boxWeight}
            onLengthChange={(v) => setLength(set(v))}
            onBreadthChange={(v) => setBreadth(set(v))}
            onHeightChange={(v) => setHeight(set(v))}
            onDeckleSizeChange={(v) => setDeckleSize(set(v))}
            onDeckleLengthChange={(v) => setDeckleLength(set(v))}
          />

          <section className="bg-white p-2 sm:p-4 rounded shadow">
            <PaperLayers
              layers={{
                top:    { gsm: topGSM,    bf: topBF    },
                bFlute: { gsm: bFluteGsm, bf: bFluteBF },
                bLiner: { gsm: bLinerGsm, bf: bLinerBF },
                cFlute: { gsm: cFluteGsm, bf: cFluteBF },
                cLiner: { gsm: cLinerGsm, bf: cLinerBF },
                aFlute: { gsm: aFluteGsm, bf: aFluteBF },
                aLiner: { gsm: aLinerGsm, bf: aLinerBF },
              }}
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
