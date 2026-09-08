export interface RotarySizeCalculation {
  adjustedWidth: number
  topFlap: number
  bottomFlap: number
  rotarySize: number
}

export function calculateSlottingSize(width: number, creasingAllowance: number): number | null {
  if (![width, creasingAllowance].every((value) => Number.isFinite(value) && value > 0)) return null
  return (width + creasingAllowance) / 2
}

export function calculateRotarySize(width: number, height: number, creasingAllowance: number): RotarySizeCalculation | null {
  if (![width, height, creasingAllowance].every((value) => Number.isFinite(value) && value > 0)) return null
  const adjustedWidth = width + creasingAllowance
  const topFlap = calculateSlottingSize(width, creasingAllowance) as number
  const bottomFlap = topFlap
  return { adjustedWidth, topFlap, bottomFlap, rotarySize: topFlap + height + bottomFlap }
}
