export const ceilToThreeDecimals = (num: number): number => 
  Math.ceil(num * 1000) / 1000;

export const FLUTE_MULTIPLIERS = {
  wastage: 1.05,
  b: 1.35,
  c: 1.45,
  a: 1.45,
};

export const DEFAULT_VALUES = {
  dimensions: { length: 0, breadth: 0, height: 0 },
  paperLayers: {
    top: { gsm: 120, bf: 16 },
    bFlute: { gsm: 120, bf: 16 },
    bLiner: { gsm: 120, bf: 16 },
    cFlute: { gsm: 0, bf: 0 },
    cLiner: { gsm: 0, bf: 0 },
    aFlute: { gsm: 0, bf: 0 },
    aLiner: { gsm: 0, bf: 0 },
  },
  prices: {
    topPr: 33,
    bFlutePr: 33,
    bLinerPr: 33,
    cFlutePr: 33,
    cLinerPr: 33,
    aFlutePr: 33,
    aLinerPr: 33,
  },
  conversion: {
    ratePerKg: 10,
    printingCharges: 0,
    transportCharges: 0,
    margin: 5,
  },
};

export const calculateDeckle = (length: number, breadth: number, height: number) => {
  const deckleSize = (breadth + height + 20) / 10;
  const deckleLength = (length + breadth + length + breadth + 50) / 10;
  return { deckleSize, deckleLength };
};

export const calculateWeightPerReem = (
  deckleSize: number,
  deckleLength: number,
  gsm: number,
  multiplier: number = 1
): number => {
  return ceilToThreeDecimals(
    ((deckleSize / 100) * (deckleLength / 100) * (gsm / 1000) * multiplier) * FLUTE_MULTIPLIERS.wastage
  );
  
};

export const calculateCostPerBox = (
  wprTop: number, wprBF: number, wprBL: number,
  wprCF: number, wprCL: number, wprAF: number, wprAL: number,
  topPr: number, bFlutePr: number, bLinerPr: number,
  cFlutePr: number, cLinerPr: number, aFlutePr: number, aLinerPr: number
): number => {
  const topCost   = ceilToThreeDecimals(topPr     * wprTop);
  const bfCost    = ceilToThreeDecimals(bFlutePr  * wprBF);
  const blCost    = ceilToThreeDecimals(bLinerPr  * wprBL);
  const cfCost    = ceilToThreeDecimals(cFlutePr  * wprCF);
  const clCost    = ceilToThreeDecimals(cLinerPr  * wprCL);
  const afCost    = ceilToThreeDecimals(aFlutePr  * wprAF);
  const alCost    = ceilToThreeDecimals(aLinerPr  * wprAL);
  const total     = topCost + bfCost + blCost + cfCost + clCost + afCost + alCost;
  console.log('[calculateCostPerBox]', {
    topCost, bfCost, blCost, cfCost, clCost, afCost, alCost,
    rawTotal: topPr*wprTop + bFlutePr*wprBF + bLinerPr*wprBL + cFlutePr*wprCF + cLinerPr*wprCL + aFlutePr*wprAF + aLinerPr*wprAL,
    ceiledTotal: total,
  });
  return total;
};

export const calculateFinalPrice = (
  costPerBox: number,
  valueBox: number,
  printingCharges: number,
  transportCharges: number,
  margin: number
): { totalCost: number; price: number } => {
  const rawBase    = costPerBox + valueBox + printingCharges + transportCharges;
  const base       = ceilToThreeDecimals(rawBase);
  const rawMargin  = base * (margin / 100);
  const marginAmount = ceilToThreeDecimals(rawMargin);
  const rawTotal   = base + marginAmount;
  const totalCost  = ceilToThreeDecimals(rawTotal);
  console.log('[calculateFinalPrice]', {
    costPerBox, valueBox, printingCharges, transportCharges, margin,
    rawBase, base,
    rawMargin, marginAmount,
    rawTotal, totalCost,
  });
  return { totalCost, price: totalCost };
};
