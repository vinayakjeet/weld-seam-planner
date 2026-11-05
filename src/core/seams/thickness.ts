import type { MeshBVH } from 'three-mesh-bvh'
import { cross, dot, normalize, scale, type Vec3 } from '../math/vec3'
import type { PlateThickness } from '../process/filletRules'
import { cornerFaces, thicknessBehind } from './classify'
import type { SeamPoint } from './frames'

// Distance from a point on a plate surface, along direction, through the material to where it leaves. Infinity on a miss.
export type RayProbe = (origin: Vec3, direction: Vec3) => number

const SAMPLE_FRACTIONS = [0.25, 0.5, 0.75]

// Dividing by a power of ten gives the nearest double to the decimal value, so 6.01 stays 6.01.
export const roundDecimals = (value: number, decimals: number): number => Math.round(value * 10 ** decimals) / 10 ** decimals

// The nearest hit over all the given BVHs, one per body or one for the whole mesh.
export function probeFromBvhs(bvhs: MeshBVH[]): RayProbe {
  return (origin, direction) => {
    const back = scale(direction, -1)
    let nearest = Infinity
    for (const bvh of bvhs) nearest = Math.min(nearest, thicknessBehind(bvh, origin, back))
    return nearest
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

// Thickness of the two plates at a seam, in the order of the seam's n1 and n2. Three samples at 25, 50 and 75 percent
// of the arc length; at each, a ray starts offsetMm along the face, perpendicular to the seam and away from the other
// plate, and runs through the plate along minus the face normal. Outside corners use cornerThickness.
export function seamThickness(points: SeamPoint[], probe: RayProbe, offsetMm = 1): PlateThickness {
  if (points.length === 0) return [null, null]
  const found: [number[], number[]] = [[], []]
  for (const fraction of SAMPLE_FRACTIONS) {
    const { p, t, n1, n2 } = points[Math.round(fraction * (points.length - 1))]!
    const faces: Array<[Vec3, Vec3]> = [[n1, n2], [n2, n1]]
    faces.forEach(([normal, other], k) => {
      let along = normalize(cross(t, normal))
      if (along[0] === 0 && along[1] === 0 && along[2] === 0) return
      const towardOther = dot(along, other)
      if (towardOther < 0) along = scale(along, -1)
      const origin: Vec3 = [p[0] + along[0] * offsetMm, p[1] + along[1] * offsetMm, p[2] + along[2] * offsetMm]
      const distance = probe(origin, scale(normal, -1))
      if (Number.isFinite(distance) && distance > 0) found[k]!.push(distance)
    })
  }
  const [a, b] = [median(found[0]), median(found[1])]
  return [a === null ? null : roundDecimals(a, 2), b === null ? null : roundDecimals(b, 2)]
}

// Thickness of the two plates of an outside corner, in the order of n1 and n2. Next to the edge a ray behind either face
// runs through the other plate and reads its extent, so each plate is measured across the span of its own face, at
// 25, 50 and 75 percent of the arc length, and the median kept.
export function cornerThickness(points: SeamPoint[], probe: RayProbe, depthMm: number): PlateThickness {
  if (points.length === 0) return [null, null]
  const found: [number[], number[]] = [[], []]
  for (const fraction of SAMPLE_FRACTIONS) {
    const faces = cornerFaces(points[Math.round(fraction * (points.length - 1))]!, probe, depthMm)
    faces?.forEach(({ thicknessMm }, k) => {
      if (Number.isFinite(thicknessMm) && thicknessMm > 0) found[k as 0 | 1].push(thicknessMm)
    })
  }
  const [a, b] = [median(found[0]), median(found[1])]
  return [a === null ? null : roundDecimals(a, 2), b === null ? null : roundDecimals(b, 2)]
}
