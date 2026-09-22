export interface TwoPlyPaperLayer {
  layer_name?: string
  gsm?: string | number | null
  bf_rct?: string | number | null
  shade?: string | null
  flute?: string | null
}

export const isTwoPlyRoll = (...values: Array<string | null | undefined>): boolean =>
  values.some((value) => /\b2\s*ply\s*rolls?\b/i.test(value ?? ''))

export function twoPlyRollLayers<T extends TwoPlyPaperLayer>(layers: T[]): { top?: T; flute?: T } {
  const top = layers.find((layer) => /\btop\b/i.test(layer.layer_name ?? '')) ?? layers[0]
  const flute = layers.find((layer) => /flut/i.test(layer.layer_name ?? '')) ?? layers.find((layer) => layer !== top)
  return { top, flute }
}

export const twoPlyRollLayerName = (layerName: string, twoPlyRoll: boolean): string => {
  if (!twoPlyRoll) return layerName
  return /flut/i.test(layerName) ? 'Flute' : 'Top'
}
