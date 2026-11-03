import type { Check } from './heatInput'

export const TRAVEL_LIMITS = { amberOverFraction: 0.25, redOverFraction: 0.5 } as const

interface Deposition {
  wireDiameterMm: number
  // Wire feed speed in m/min, as welding power sources report it.
  wireFeedMpm: number
  efficiency?: number
  // Convex bead reinforcement as a fraction of the fillet area.
  reinforcement?: number
}

const positive = (x: number) => Number.isFinite(x) && x > 0

function wireAreaFlow({ wireDiameterMm, wireFeedMpm, efficiency = 0.95 }: Deposition): number | null {
  if (!positive(wireDiameterMm) || !positive(wireFeedMpm) || !positive(efficiency)) return null
  // mm3 of deposited metal per minute
  return wireFeedMpm * 1000 * ((Math.PI * wireDiameterMm * wireDiameterMm) / 4) * efficiency
}

// Fillet cross section is 0.5 z^2 for a flat bead, scaled by (1 + reinforcement).
export function depositionTravelMmMin(args: Deposition & { legMm: number }): number | null {
  const flow = wireAreaFlow(args)
  const r = args.reinforcement ?? 0.1
  if (flow === null || !positive(args.legMm) || !Number.isFinite(r) || r < 0) return null
  return flow / (0.5 * args.legMm * args.legMm * (1 + r))
}

export function depositedLegMm(args: Deposition & { travelMmMin: number }): number | null {
  const flow = wireAreaFlow(args)
  const r = args.reinforcement ?? 0.1
  if (flow === null || !positive(args.travelMmMin) || !Number.isFinite(r) || r < 0) return null
  return Math.sqrt(flow / (0.5 * args.travelMmMin * (1 + r)))
}

export function travelSpeedCheck(actualMmS: number, suggestedMmS: number | null): Check {
  if (suggestedMmS === null || !positive(suggestedMmS) || !Number.isFinite(actualMmS)) return { level: 'ok', reason: '' }
  const off = Math.abs(actualMmS - suggestedMmS) / suggestedMmS
  const pct = Math.round(off * 100)
  const word = actualMmS > suggestedMmS ? 'faster' : 'slower'
  const detail = `Travel speed ${actualMmS.toFixed(1)} mm/s is ${pct}% ${word} than the ${suggestedMmS.toFixed(1)} mm/s the wire feed deposits for this leg.`
  if (off > TRAVEL_LIMITS.redOverFraction) return { level: 'red', reason: detail }
  if (off > TRAVEL_LIMITS.amberOverFraction) return { level: 'amber', reason: detail }
  return { level: 'ok', reason: '' }
}
