export const advancedCeilToThreeDecimals = (num: number): number => 
  Math.ceil(num * 1000) / 1000;

export const ADVANCED_FLUTE_MULTIPLIERS = {
  wastage: 1.05,
  b: 1.35,
  c: 1.45,
  a: 1.45,
};

export const ADVANCED_DEFAULT_VALUES = {
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

export const calculateAdvancedDeckle = (length: number, breadth: number, height: number) => {
  const deckleSize = (breadth + height + 20) / 10;
  const deckleLength = (length + breadth + length + breadth + 50) / 10;
  return { deckleSize, deckleLength };
};

export const calculateAdvancedWeightPerReem = (
  deckleSize: number,
  deckleLength: number,
  gsm: number,
  multiplier: number = 1
): number => {
  return advancedCeilToThreeDecimals(
    ((deckleSize / 100) * (deckleLength / 100) * (gsm / 1000) * multiplier) * ADVANCED_FLUTE_MULTIPLIERS.wastage
  );
  
};

export const calculateAdvancedCostPerBox = (
  wprTop: number, wprBF: number, wprBL: number,
  wprCF: number, wprCL: number, wprAF: number, wprAL: number,
  topPr: number, bFlutePr: number, bLinerPr: number,
  cFlutePr: number, cLinerPr: number, aFlutePr: number, aLinerPr: number
): number => {
  const topCost   = advancedCeilToThreeDecimals(topPr     * wprTop);
  const bfCost    = advancedCeilToThreeDecimals(bFlutePr  * wprBF);
  const blCost    = advancedCeilToThreeDecimals(bLinerPr  * wprBL);
  const cfCost    = advancedCeilToThreeDecimals(cFlutePr  * wprCF);
  const clCost    = advancedCeilToThreeDecimals(cLinerPr  * wprCL);
  const afCost    = advancedCeilToThreeDecimals(aFlutePr  * wprAF);
  const alCost    = advancedCeilToThreeDecimals(aLinerPr  * wprAL);
  const total     = topCost + bfCost + blCost + cfCost + clCost + afCost + alCost;
  console.log('[calculateAdvancedCostPerBox]', {
    topCost, bfCost, blCost, cfCost, clCost, afCost, alCost,
    rawTotal: topPr*wprTop + bFlutePr*wprBF + bLinerPr*wprBL + cFlutePr*wprCF + cLinerPr*wprCL + aFlutePr*wprAF + aLinerPr*wprAL,
    ceiledTotal: total,
  });
  return total;
};

export const calculateAdvancedFinalPrice = (
  costPerBox: number,
  valueBox: number,
  printingCharges: number,
  transportCharges: number,
  margin: number
): { totalCost: number; price: number } => {
  const rawBase    = costPerBox + valueBox + printingCharges + transportCharges;
  const base       = advancedCeilToThreeDecimals(rawBase);
  const rawMargin  = base * (margin / 100);
  const marginAmount = advancedCeilToThreeDecimals(rawMargin);
  const rawTotal   = base + marginAmount;
  const totalCost  = advancedCeilToThreeDecimals(rawTotal);
  console.log('[calculateAdvancedFinalPrice]', {
    costPerBox, valueBox, printingCharges, transportCharges, margin,
    rawBase, base,
    rawMargin, marginAmount,
    rawTotal, totalCost,
  });
  return { totalCost, price: totalCost };
};
