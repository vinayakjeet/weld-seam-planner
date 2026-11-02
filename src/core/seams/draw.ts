import { Vector3 } from 'three'
import type { MeshBVH } from 'three-mesh-bvh'
import { add, dot, length, scale, sub, type Vec3 } from '../math/vec3'
import type { FaceData } from '../mesh/faces'
import type { MeshModel } from '../mesh/model'
import { buildWholeBvh } from './bodyBvh'
import type { SeamCandidate } from './detect'
import { pointsFromPolyline } from './frames'
import type { ManualError } from './manual'

export interface DrawClick {
  p: Vec3
  // Triangle the click landed on.
  face: number
}

export interface SnapContext {
  model: MeshModel
  faces: FaceData
  // Edges a drawn seam can snap to: dihedral of FEATURE_DEG or more, boundary and non-manifold edges.
  featureEdges: Uint32Array
  // Feature edges meeting at each vertex.
  edgesAt: Map<number, number[]>
  // Whole-mesh BVH for projecting onto the surface; built on first use.
  surface: () => MeshBVH
}

const FEATURE_DEG = 15
const PATH_LIMIT = 3
const MIN_LENGTH_MM = 1
const SAME_POINT_MM = 1e-9
const PROJECTION_SPACING_MM = 2
const MAX_PROJECTION_SAMPLES = 200

export function buildSnapContext(model: MeshModel, faces: FaceData): SnapContext {
  const { edges } = model
  const flat = Math.cos((FEATURE_DEG * Math.PI) / 180)
  const feature: number[] = []
  const edgesAt = new Map<number, number[]>()
  for (let e = 0; e < edges.edgeCount; e++) {
    if (edges.useCount[e] === 2) {
      const a = edges.faceA[e]! * 3
      const b = edges.faceB[e]! * 3
      const cos = faces.normals[a]! * faces.normals[b]! + faces.normals[a + 1]! * faces.normals[b + 1]! + faces.normals[a + 2]! * faces.normals[b + 2]!
      if (cos > flat) continue
    }
    feature.push(e)
    for (const v of [edges.edgeA[e]!, edges.edgeB[e]!]) {
      const list = edgesAt.get(v)
      if (list) list.push(e)
      else edgesAt.set(v, [e])
    }
  }
  let bvh: MeshBVH | null = null
  return { model, faces, featureEdges: Uint32Array.from(feature), edgesAt, surface: () => (bvh ??= buildWholeBvh(model).bvh) }
}

const vertex = (ctx: SnapContext, v: number): Vec3 => {
  const { positions } = ctx.model.mesh
  return [positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!]
}

const faceNormal = (ctx: SnapContext, f: number): Vec3 => [ctx.faces.normals[f * 3]!, ctx.faces.normals[f * 3 + 1]!, ctx.faces.normals[f * 3 + 2]!]

interface Snap {
  point: Vec3
  edge: number
}

function nearestFeature(ctx: SnapContext, p: Vec3, radius: number): Snap | null {
  let best: Snap | null = null
  let bestDistance = radius
  for (const e of ctx.featureEdges) {
    const a = vertex(ctx, ctx.model.edges.edgeA[e]!)
    const ab = sub(vertex(ctx, ctx.model.edges.edgeB[e]!), a)
    const u = Math.min(1, Math.max(0, dot(sub(p, a), ab) / dot(ab, ab)))
    const point = add(a, scale(ab, u))
    const distance = length(sub(p, point))
    if (distance <= bestDistance) {
      bestDistance = distance
      best = { point, edge: e }
    }
  }
  return best
}

// Plate normals beside an edge. A boundary edge has one plate, so its normal stands in for both.
function edgeNormals(ctx: SnapContext, e: number): { normals: [Vec3, Vec3]; approximate: boolean } {
  const { edges } = ctx.model
  const a = faceNormal(ctx, edges.faceA[e]!)
  if (edges.useCount[e] === 1) return { normals: [a, a], approximate: true }
  return { normals: [a, faceNormal(ctx, edges.faceB[e]!)], approximate: false }
}

interface Step {
  to: Vec3
  edge: number
}

// Shortest walk along feature edges from one snapped point to another, or null when none is within limitMm.
function walkEdges(ctx: SnapContext, from: Snap, to: Snap, limitMm: number): Step[] | null {
  const { edges } = ctx.model
  if (from.edge === to.edge) return [{ to: to.point, edge: to.edge }]

  const cost = new Map<number, number>()
  const via = new Map<number, { from: number; edge: number } | null>()
  const queue: Array<[number, number]> = []
  const push = (c: number, v: number) => {
    queue.push([c, v])
    for (let i = queue.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1
      if (queue[parent]![0] <= queue[i]![0]) break
      ;[queue[parent], queue[i]] = [queue[i]!, queue[parent]!]
      i = parent
    }
  }
  const pop = (): [number, number] => {
    const top = queue[0]!
    const last = queue.pop()!
    if (queue.length > 0) {
      queue[0] = last
      for (let i = 0; ; ) {
        let smallest = i
        for (const child of [2 * i + 1, 2 * i + 2]) if (child < queue.length && queue[child]![0] < queue[smallest]![0]) smallest = child
        if (smallest === i) break
        ;[queue[smallest], queue[i]] = [queue[i]!, queue[smallest]!]
        i = smallest
      }
    }
    return top
  }

  for (const v of [edges.edgeA[from.edge]!, edges.edgeB[from.edge]!]) {
    const c = length(sub(vertex(ctx, v), from.point))
    if (c <= limitMm) {
      cost.set(v, c)
      via.set(v, null)
      push(c, v)
    }
  }
  const targets = [edges.edgeA[to.edge]!, edges.edgeB[to.edge]!]
  let best: { total: number; vertex: number } | null = null
  while (queue.length > 0) {
    const [c, v] = pop()
    if (c > cost.get(v)!) continue
    if (best && c >= best.total) break
    if (targets.includes(v)) {
      const total = c + length(sub(vertex(ctx, v), to.point))
      if (total <= limitMm && (!best || total < best.total)) best = { total, vertex: v }
    }
    for (const e of ctx.edgesAt.get(v) ?? []) {
      const other = edges.edgeA[e] === v ? edges.edgeB[e]! : edges.edgeA[e]!
      const next = c + length(sub(vertex(ctx, other), vertex(ctx, v)))
      if (next <= limitMm && next < (cost.get(other) ?? Infinity)) {
        cost.set(other, next)
        via.set(other, { from: v, edge: e })
        push(next, other)
      }
    }
  }
  if (!best) return null

  const reached: Step[] = []
  for (let v: number | undefined = best.vertex; v !== undefined; ) {
    const step = via.get(v)
    reached.push({ to: vertex(ctx, v), edge: step ? step.edge : from.edge })
    v = step ? step.from : undefined
  }
  return [...reached.reverse(), { to: to.point, edge: to.edge }]
}

const tooShort = (lengthMm: number): ManualError => ({
  what: 'No seam was drawn.',
  why: `The clicks are only ${lengthMm.toFixed(1)} mm apart, less than the ${MIN_LENGTH_MM} mm a seam needs.`,
  next: 'Click further apart along the joint.',
})

export function snapPolyline(clicks: DrawClick[], ctx: SnapContext, snapRadiusMm: number): SeamCandidate | ManualError {
  if (clicks.length < 2) {
    return {
      what: 'No seam was drawn.',
      why: `A seam needs at least two clicks and ${clicks.length} ${clicks.length === 1 ? 'was' : 'were'} given.`,
      next: 'Click the start of the seam, then click along the joint to its end.',
    }
  }

  const snaps = clicks.map((c) => (snapRadiusMm > 0 ? nearestFeature(ctx, c.p, snapRadiusMm) : null))
  const polyline: Vec3[] = [snaps[0]?.point ?? clicks[0]!.p]
  const segmentNormals: Array<[Vec3, Vec3]> = []
  const approximate: boolean[] = []
  const extend = (to: Vec3, normals: [Vec3, Vec3], isApproximate: boolean) => {
    if (length(sub(to, polyline[polyline.length - 1]!)) < SAME_POINT_MM) return
    polyline.push(to)
    segmentNormals.push(normals)
    approximate.push(isApproximate)
  }

  for (let i = 0; i + 1 < clicks.length; i++) {
    const from = snaps[i]
    const to = snaps[i + 1]
    const start = polyline[polyline.length - 1]!
    const end = to?.point ?? clicks[i + 1]!.p
    const straight = length(sub(end, start))

    const walk = from && to && straight > SAME_POINT_MM ? walkEdges(ctx, from, to, PATH_LIMIT * straight) : null
    if (walk) {
      for (const step of walk) {
        const { normals, approximate: rough } = edgeNormals(ctx, step.edge)
        extend(step.to, normals, rough)
      }
      continue
    }

    // No edge path, or a much longer one: lay the straight segment onto the surface instead. Each piece takes the
    // plate normal of the interior sample beside it, because a snapped end sits on an edge between two plates.
    const samples = Math.min(MAX_PROJECTION_SAMPLES, Math.max(2, Math.ceil(straight / PROJECTION_SPACING_MM)))
    const along = (k: number) => add(start, scale(sub(end, start), k / samples))
    const hits = Array.from({ length: samples }, (_, k) => {
      if (k === 0) return null
      const hit = ctx.surface().closestPointToPoint(new Vector3(...along(k)))
      return { p: hit ? ([hit.point.x, hit.point.y, hit.point.z] as Vec3) : along(k), face: hit?.faceIndex ?? clicks[i]!.face }
    })
    for (let k = 1; k <= samples; k++) {
      const n = faceNormal(ctx, hits[Math.min(k, samples - 1)]!.face)
      extend(k === samples ? end : hits[k]!.p, [n, n], true)
    }
  }

  if (polyline.length < 2) return tooShort(0)
  const { points, lengthMm } = pointsFromPolyline(polyline, false, (segment) => segmentNormals[segment]!)
  if (lengthMm < MIN_LENGTH_MM) return tooShort(lengthMm)

  const opening = segmentNormals.reduce((sum, [n1, n2]) => sum + 180 - (Math.acos(Math.min(1, Math.max(-1, dot(n1, n2)))) * 180) / Math.PI, 0)
  return {
    id: 'drawn',
    label: 'D',
    source: 'manual',
    concavity: 'unknown',
    jointType: 'fillet',
    hidden: false,
    confidence: 1,
    closed: false,
    lengthMm,
    openingAngleDeg: opening / segmentNormals.length,
    points,
    ...(approximate.some(Boolean) ? { approximateNormals: true } : {}),
  }
}
