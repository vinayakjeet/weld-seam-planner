import { DoubleSide, Box3, Ray, Vector3 } from 'three'
import type { MeshBVH } from 'three-mesh-bvh'
import { cross, dot, length, normalize, scale, sub, type Vec3 } from '../math/vec3'
import type { FaceData } from '../mesh/faces'
import type { MeshModel } from '../mesh/model'
import type { SeamSource } from './detect'
import type { SeamPoint } from './frames'
import type { RayProbe } from './thickness'

export type JointType = 'fillet' | 'lap' | 'corner' | 'saddle'

// A face is the end face of the plate behind another when it is at most this many plate thicknesses wide.
const LAP_RATIO = 1.5
// A loop is a saddle when it leaves its best-fit plane by more than this share of its mean radius.
const SADDLE_FRACTION = 0.03
const COPLANAR_DEG = 5
// A patch this large is a floor or a wall, never a strip, so the search stops and reports it as unbounded.
const MAX_PATCH_TRIANGLES = 20000

export interface JointInput {
  source: SeamSource
  closed: boolean
  points: Array<Pick<SeamPoint, 'p'>>
  // Width of the free face's flat patch measured away from the seam, the thickness of the plate behind the touched
  // surface, and the depth of the plate behind the free face. Infinity (or NaN) means unknown, which can never make a lap.
  stripWidthMm: number
  touchedThicknessMm: number
  stripLengthMm: number
  convex: boolean
}

// AWS D1.1 asks a lap joint for an overlap of five times the thinner part and never less than 25 mm.
const LAP_OVERLAP_RATIO = 5
const MIN_LAP_OVERLAP_MM = 25

// The free face of a lap is the end face of the lapping plate, so its width is that plate's thickness, and the plate
// runs back from it at least as far as it is wide and as far as the minimum lap overlap. The thickness of the touched
// plate only enters the overlap, so plates of very different thickness still lap. The side of a web has only the web
// thickness behind it, and the overhang of a narrow flange only the flange, so both stay T fillets.
export function isLap(stripWidthMm: number, touchedThicknessMm: number, stripLengthMm: number): boolean {
  if (!(Number.isFinite(touchedThicknessMm) && touchedThicknessMm > 0)) return false
  if (!(Number.isFinite(stripWidthMm) && Number.isFinite(stripLengthMm) && stripLengthMm >= stripWidthMm)) return false
  return stripLengthMm >= Math.max(MIN_LAP_OVERLAP_MM, LAP_OVERLAP_RATIO * Math.min(stripWidthMm, touchedThicknessMm))
}

export function classifyJoint(input: JointInput): JointType {
  if (input.convex) return 'corner'
  if (input.source === 'intersection') return isNonPlanar(input.points.map(({ p }) => p)) ? 'saddle' : 'fillet'
  return isLap(input.stripWidthMm, input.touchedThicknessMm, input.stripLengthMm) ? 'lap' : 'fillet'
}

// The direction in the plane of `face` that runs across it away from the seam at p with tangent t, or null when the
// tangent lies along the face normal.
export function acrossFace(faces: FaceData, face: number, p: Vec3, t: Vec3): Vec3 | null {
  const { normals, centroids } = faces
  const n: Vec3 = [normals[face * 3]!, normals[face * 3 + 1]!, normals[face * 3 + 2]!]
  const u = normalize(cross(n, t))
  if (length(u) === 0) return null
  const toFace: Vec3 = [centroids[face * 3]! - p[0], centroids[face * 3 + 1]! - p[1], centroids[face * 3 + 2]! - p[2]]
  return dot(u, toFace) < 0 ? [-u[0], -u[1], -u[2]] : u
}

// How far from the seam the flat patch of `face` reaches, measured in the face's plane perpendicular to the seam
// tangent t, from the seam point p. The patch is every face reachable across manifold edges whose normal is within
// 5 degrees of the starting face. Once the width passes cap the walk stops and returns what it has, which is over cap.
export function patchWidth(model: MeshModel, faces: FaceData, face: number, p: Vec3, t: Vec3, cap = Infinity): number {
  const { edges, mesh } = model
  const { indices, positions, vertexCount } = mesh
  const { normals } = faces
  const n: Vec3 = [normals[face * 3]!, normals[face * 3 + 1]!, normals[face * 3 + 2]!]
  const u = acrossFace(faces, face, p, t)
  if (!u) return Infinity

  const cosLimit = Math.cos((COPLANAR_DEG * Math.PI) / 180)
  const seen = new Set<number>([face])
  const stack = [face]
  let width = 0
  while (stack.length > 0) {
    const f = stack.pop()!
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k]! * 3
      width = Math.max(width, (positions[v]! - p[0]) * u[0] + (positions[v + 1]! - p[1]) * u[1] + (positions[v + 2]! - p[2]) * u[2])
    }
    if (width > cap) return width
    if (seen.size > MAX_PATCH_TRIANGLES) return Infinity
    for (let k = 0; k < 3; k++) {
      const a = indices[f * 3 + k]!
      const b = indices[f * 3 + ((k + 1) % 3)]!
      const e = edges.keyToEdge.get(a < b ? a * vertexCount + b : b * vertexCount + a)!
      if (edges.useCount[e] !== 2) continue
      const g = edges.faceA[e] === f ? edges.faceB[e]! : edges.faceA[e]!
      if (seen.has(g)) continue
      if (normals[g * 3]! * n[0] + normals[g * 3 + 1]! * n[1] + normals[g * 3 + 2]! * n[2] < cosLimit) continue
      seen.add(g)
      stack.push(g)
    }
  }
  return width
}

const RAY = new Ray()
const BOX = new Box3()
const SIZE = new Vector3()

// Distance from the surface point p, through the material, to the far side: one ray along minus the outward normal.
// The ray starts a hair inside so it does not hit the surface it starts on. Infinity when nothing lies behind.
export function thicknessBehind(bvh: MeshBVH, p: Vec3, normal: Vec3): number {
  const nudge = Math.max(1e-6, 1e-4 * bvh.getBoundingBox(BOX).getSize(SIZE).length())
  RAY.origin.set(p[0] - normal[0] * nudge, p[1] - normal[1] * nudge, p[2] - normal[2] * nudge)
  RAY.direction.set(-normal[0], -normal[1], -normal[2])
  const hit = bvh.raycastFirst(RAY, DoubleSide)
  return hit ? hit.distance + nudge : Infinity
}

const SPAN_FRACTIONS = [0.25, 0.5, 0.75]

// Whether a convex edge is where two plates meet (the heel of an L) rather than the edge of one plate. Face i is the
// end face of the plate behind face j when it is no wider than LAP_RATIO times that plate's thickness, as in the lap
// rule. The width of face i is the depth of material just under it, along it, away from the edge. The thickness behind
// face j is the median of three rays across the span of face j: at the edge itself a ray would run into the other
// plate of an L, and one ray may meet a hole, a gusset or another body. depthMm is how far under a face the width ray runs.
export function meetsSecondPlate(point: Pick<SeamPoint, 'p' | 't' | 'n1' | 'n2'>, probe: RayProbe, depthMm: number): boolean {
  const { p, t, n1, n2 } = point
  const away = (normal: Vec3, other: Vec3): Vec3 => {
    const u = normalize(cross(t, normal))
    return dot(u, other) > 0 ? scale(u, -1) : u
  }
  const at = (normal: Vec3, u: Vec3, along: number): Vec3 => [
    p[0] + u[0] * along - normal[0] * depthMm,
    p[1] + u[1] * along - normal[1] * depthMm,
    p[2] + u[2] * along - normal[2] * depthMm,
  ]
  const faces = [n1, n2].map((normal, k) => {
    const u = away(normal, k === 0 ? n2 : n1)
    return { normal, u, width: length(u) === 0 ? Infinity : probe(at(normal, u, depthMm), u) + depthMm }
  })
  if (!faces.every((f) => Number.isFinite(f.width))) return false
  const thickness = ({ normal, u, width }: (typeof faces)[number]) =>
    SPAN_FRACTIONS.map((f) => probe(at(normal, u, f * width), scale(normal, -1)) + depthMm).sort((a, b) => a - b)[1]!
  const endFace = (i: number) => faces[i]!.width <= LAP_RATIO * thickness(faces[1 - i]!)
  return !endFace(0) && !endFace(1)
}

function isNonPlanar(points: Vec3[]): boolean {
  if (points.length < 4) return false
  const centre: Vec3 = [0, 0, 0]
  for (const p of points) for (let c = 0; c < 3; c++) centre[c]! += p[c]! / points.length
  const offsets = points.map((p) => sub(p, centre))
  const radius = offsets.reduce((sum, o) => sum + length(o), 0) / offsets.length
  if (radius === 0) return false

  const covariance = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (const o of offsets) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) covariance[i]![j]! += o[i]! * o[j]!
  const normal = smallestAxis(covariance)
  const deviation = Math.max(...offsets.map((o) => Math.abs(dot(o, normal))))
  return deviation > SADDLE_FRACTION * radius
}

// Eigenvector of the smallest eigenvalue of a symmetric 3 x 3 matrix, by Jacobi rotations.
function smallestAxis(matrix: number[][]): Vec3 {
  const a = matrix.map((row) => [...row])
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  const scale = Math.abs(a[0]![0]!) + Math.abs(a[1]![1]!) + Math.abs(a[2]![2]!)
  for (let sweep = 0; sweep < 30; sweep++) {
    if (Math.abs(a[0]![1]!) + Math.abs(a[0]![2]!) + Math.abs(a[1]![2]!) <= 1e-14 * scale) break
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      const apq = a[p]![q]!
      if (apq === 0) continue
      const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq)
      const tan = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const cos = 1 / Math.sqrt(tan * tan + 1)
      const sin = tan * cos
      for (let k = 0; k < 3; k++) {
        const akp = a[k]![p]!
        const akq = a[k]![q]!
        a[k]![p] = cos * akp - sin * akq
        a[k]![q] = sin * akp + cos * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p]![k]!
        const aqk = a[q]![k]!
        a[p]![k] = cos * apk - sin * aqk
        a[q]![k] = sin * apk + cos * aqk
        const vkp = v[k]![p]!
        const vkq = v[k]![q]!
        v[k]![p] = cos * vkp - sin * vkq
        v[k]![q] = sin * vkp + cos * vkq
      }
    }
  }
  const smallest = [0, 1, 2].reduce((best, i) => (a[i]![i]! < a[best]![best]! ? i : best), 0)
  return [v[0]![smallest]!, v[1]![smallest]!, v[2]![smallest]!]
}
