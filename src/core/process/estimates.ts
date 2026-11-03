export const WIRE_DENSITY_KG_MM3 = 7.85e-6

export interface SeamEstimateInput {
  lengthMm: number
  passes: number
  travelSpeedMmS: number
  wireDiameterMm: number
  wireFeedMpm?: number
  gasFlowLpm?: number
  preflowS: number
  postflowS: number
}

export function seamEstimates(input: SeamEstimateInput): { arcTimeS: number; wireKg: number; gasL: number } {
  const { lengthMm, passes, travelSpeedMmS, wireDiameterMm, wireFeedMpm, gasFlowLpm, preflowS, postflowS } = input
  const arcTimeS = travelSpeedMmS > 0 ? (passes * lengthMm) / travelSpeedMmS : 0
  const wireAreaMm2 = (Math.PI * wireDiameterMm * wireDiameterMm) / 4
  const wireKg = wireFeedMpm ? ((wireFeedMpm * 1000) / 60) * arcTimeS * wireAreaMm2 * WIRE_DENSITY_KG_MM3 : 0
  const gasL = gasFlowLpm ? (gasFlowLpm * (arcTimeS + preflowS + postflowS)) / 60 : 0
  return { arcTimeS, wireKg, gasL }
}
