import { add, length, scale, type Vec3 } from '../../core/math/vec3'
import type { AccessStation } from '../../core/access/clearance'

export interface ConeShape {
  apex: Vec3
  // Unit vector from the apex to the middle of the base: the way the torch looks, minus the tool z.
  axis: Vec3
  baseCentre: Vec3
  baseRadius: number
  lengthMm: number
}

// The free cone in front of the torch tip: apex at the tip, opening along minus tool z, lengthMm tall.
export function coneGeometry(tcp: Vec3, toolZ: Vec3, halfAngleDeg: number, lengthMm: number): ConeShape {
  const n = length(toolZ) || 1
  const axis: Vec3 = [-toolZ[0] / n + 0, -toolZ[1] / n + 0, -toolZ[2] / n + 0]
  return {
    apex: [...tcp],
    axis,
    baseCentre: add(tcp, scale(axis, lengthMm)),
    baseRadius: lengthMm * Math.tan((halfAngleDeg * Math.PI) / 180),
    lengthMm,
  }
}

// The measured station closest to where the torch preview stands.
export function nearestStation(stations: readonly AccessStation[], s: number): AccessStation | null {
  let best: AccessStation | null = null
  for (const station of stations) {
    if (best === null || Math.abs(station.s - s) < Math.abs(best.s - s)) best = station
  }
  return best
}
