import type { Procedure } from '../job/schema'
import { depositedLegMm } from './travelSpeed'

// Same order as a seam's n1, n2; null where the thickness could not be measured.
export type PlateThickness = [number | null, number | null]

export const MULTI_PASS_LEG_MM = 8

const FALLBACK_LEG_MM = 6

// AWS D1.1 minimum fillet size by the thicker part, intervals (lo, hi].
export function minLegMm(thickerMm: number): number {
  if (thickerMm <= 6) return 3
  if (thickerMm <= 12) return 5
  if (thickerMm <= 20) return 6
  return 8
}

export function maxLegAlongEdgeMm(edgeMm: number): number {
  return edgeMm < 6 ? edgeMm : edgeMm - 1.6
}

export function throatMm(legMm: number): number {
  return 0.707 * legMm
}

function known(thickness: PlateThickness): number[] {
  return thickness.filter((t): t is number => t !== null && Number.isFinite(t) && t > 0)
}

export function legLimits(jointType: string, thickness: PlateThickness): { minMm: number | null; maxMm: number | null } {
  const t = known(thickness)
  if (t.length === 0) return { minMm: null, maxMm: null }
  const edgeJoint = jointType === 'lap' || jointType === 'corner'
  return {
    minMm: minLegMm(Math.max(...t)),
    maxMm: edgeJoint ? maxLegAlongEdgeMm(Math.min(...t)) : null,
  }
}

export interface EffectiveLegInput {
  legMm: number | null
  procedure: Procedure | null
  thickness: PlateThickness
  jointType: string
}

export type LegSource = 'set' | 'procedure' | 'minimum' | 'fallback'

export function effectiveLegMm({ legMm, procedure, thickness, jointType }: EffectiveLegInput): { legMm: number; source: LegSource } {
  if (legMm !== null) return { legMm, source: 'set' }
  const { minMm, maxMm } = legLimits(jointType, thickness)

  const feed = procedure?.electrical.wireFeedMpm
  if (procedure && feed !== undefined) {
    const deposited = depositedLegMm({
      wireDiameterMm: procedure.wire.diameterMm,
      wireFeedMpm: feed,
      travelMmMin: procedure.travelSpeedMmS * 60,
    })
    if (deposited !== null) {
      let leg = Math.round(deposited * 2) / 2
      if (minMm !== null) leg = Math.max(leg, minMm)
      if (maxMm !== null) leg = Math.min(leg, maxMm)
      return { legMm: leg, source: 'procedure' }
    }
  }
  if (minMm !== null) return { legMm: minMm, source: 'minimum' }
  return { legMm: FALLBACK_LEG_MM, source: 'fallback' }
}
