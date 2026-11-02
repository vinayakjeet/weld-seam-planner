import type { Vec3 } from '../math/vec3'
import { computeFaceData, type FaceData } from '../mesh/faces'
import type { MeshModel } from '../mesh/model'
import { buildBodyBvhs, type BodyBvh } from './bodyBvh'
import { chainEdges, edgeEnds, type Chain } from './chain'
import { confidence } from './confidence'
import { contactTolerance, findContactEdges } from './contact'
import { extractCreaseEdges, type CreaseEdges } from './crease'
import { buildSeamPoints, pointsFromPolyline, type NormalsOf, type SeamPoint } from './frames'
import { chainSegments, findIntersectionSegments } from './intersect'
import { extractNonManifoldWedges } from './nonManifold'

export interface DetectSettings {
  creaseAngleDeg: number
}

export const DEFAULT_DETECT_SETTINGS: DetectSettings = { creaseAngleDeg: 30 }

// Passes that need per-body BVHs reuse these when given; otherwise they build their own.
export interface DetectContext {
  bodyBvhs?: BodyBvh[]
}

export type SeamSource = 'crease' | 'contact' | 'intersection' | 'nonmanifold' | 'manual'

export interface SeamCandidate {
  id: string
  label: string
  source: SeamSource
  // Unknown when the body has no known inside, so a fillet could equally be a convex corner.
  concavity: 'known' | 'unknown'
  jointType: 'fillet'
  confidence: number
  closed: boolean
  lengthMm: number
  openingAngleDeg: number
  points: SeamPoint[]
}

const TURN_BREAK_DEG = 40
const MIN_LENGTH_MM = 10
const MIN_LENGTH_FRACTION = 0.01

type RawSeam = Omit<SeamCandidate, 'label'>

export function detectSeams(model: MeshModel, settings: DetectSettings, context: DetectContext = {}): SeamCandidate[] {
  const faces = computeFaceData(model.mesh)
  const minLength = Math.max(MIN_LENGTH_MM, MIN_LENGTH_FRACTION * model.bounds.diagonal)

  const creases = extractCreaseEdges(model, faces, settings.creaseAngleDeg)
  const found: RawSeam[] = seamsFromEdges('crease', creases, model, faces, minLength)

  found.push(...nonManifoldSeams(model, faces, settings, minLength))

  if (model.bodies.count > 1) {
    const bvhs = context.bodyBvhs ?? buildBodyBvhs(model)
    found.push(...contactSeams(model, faces, bvhs, settings, minLength), ...intersectionSeams(model, bvhs, minLength))
  }

  for (const seam of found) seam.id = seamId(seam)
  found.sort((a, b) => Math.round(b.lengthMm * 1000) - Math.round(a.lengthMm * 1000) || a.id.localeCompare(b.id))

  const used = new Set<string>()
  return found.map((seam, i) => {
    let id = seam.id
    for (let n = 2; used.has(id); n++) id = `${seam.id}-${n}`
    used.add(id)
    return { ...seam, id, label: `S${i + 1}` }
  })
}

// The plate normals of a contact seam are the free face of the touching body and the surface it touches, so the
// opening angle is measured between those two, not between the two faces of the touching body's own edge.
function contactSeams(model: MeshModel, faces: FaceData, bvhs: BodyBvh[], settings: DetectSettings, minLength: number): RawSeam[] {
  const contact = findContactEdges(model, faces, bvhs, settings.creaseAngleDeg)
  const normalsOfEdge = (k: number): [Vec3, Vec3] => {
    const free = contact.freeFace[k]! * 3
    return [
      [faces.normals[free]!, faces.normals[free + 1]!, faces.normals[free + 2]!],
      [contact.touchedNormal[k * 3]!, contact.touchedNormal[k * 3 + 1]!, contact.touchedNormal[k * 3 + 2]!],
    ]
  }
  const dihedralDeg = Float32Array.from(contact.edgeIds, (_, k) => {
    const [n1, n2] = normalsOfEdge(k)
    const cos = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
  })
  const unknown = new Uint8Array(contact.edgeIds.length)
  return seamsFromEdges('contact', { edgeIds: contact.edgeIds, dihedralDeg, unknown }, model, faces, minLength, normalsOfEdge)
}

// Wedges of one edge run along the same line, so each rank is chained on its own; chaining them together would
// join the two coincident seams of a fused T into a loop.
function nonManifoldSeams(model: MeshModel, faces: FaceData, settings: DetectSettings, minLength: number): RawSeam[] {
  const wedges = extractNonManifoldWedges(model, settings.creaseAngleDeg)
  const seams: RawSeam[] = []
  for (let rank = 0; wedges.some((w) => w.rank >= rank); rank++) {
    const group = wedges.filter((w) => w.rank === rank)
    const edges: CreaseEdges = {
      edgeIds: Uint32Array.from(group, (w) => w.edge),
      dihedralDeg: Float32Array.from(group, (w) => 180 - w.openingDeg),
      unknown: new Uint8Array(group.length),
    }
    seams.push(...seamsFromEdges('nonmanifold', edges, model, faces, minLength, (k) => [group[k]!.n1, group[k]!.n2]))
  }
  return seams
}

const WELD_FRACTION = 1e-4
const MIN_WELD_MM = 0.001

// Intersection chains are not mesh edges, so they carry their own plate normals and triangle areas. The opening angle
// is the length-weighted mean of 180 minus the angle between the two outward triangle normals.
function intersectionSeams(model: MeshModel, bvhs: BodyBvh[], minLength: number): RawSeam[] {
  const { diagonal } = model.bounds
  const segments = findIntersectionSegments(model, bvhs, contactTolerance(diagonal))
  const seams: RawSeam[] = []
  for (const line of chainSegments(segments, Math.max(WELD_FRACTION * diagonal, MIN_WELD_MM))) {
    const { points, lengthMm } = pointsFromPolyline(line.points, line.closed, (segment) => line.normals[segment]!)
    if (lengthMm < minLength) continue
    let weighted = 0
    let total = 0
    line.normals.forEach(([n1, n2], k) => {
      const a = line.points[k]!
      const b = line.points[(k + 1) % line.points.length]!
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      const cos = Math.max(-1, Math.min(1, n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]))
      weighted += length * (180 - (Math.acos(cos) * 180) / Math.PI)
      total += length
    })
    const openingAngleDeg = weighted / total
    seams.push({
      id: '',
      source: 'intersection',
      concavity: 'known',
      jointType: 'fillet',
      confidence: confidence({ lengthMm, openingDeg: openingAngleDeg, medianAdjacentAreaMm2: median(line.areas), diagonal }),
      closed: line.closed,
      lengthMm,
      openingAngleDeg,
      points,
    })
  }
  return seams
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

// Chains the edges, drops chains under minLength and describes the rest. normalsOfEdge indexes the edge list.
function seamsFromEdges(
  source: SeamSource,
  edges: CreaseEdges,
  model: MeshModel,
  faces: FaceData,
  minLength: number,
  normalsOfEdge?: (edge: number) => [Vec3, Vec3],
): RawSeam[] {
  const chains = chainEdges(model.mesh.positions, edgeEnds(model.edges, edges.edgeIds), TURN_BREAK_DEG)
  const seams: RawSeam[] = []
  for (const chain of chains) {
    const normalsOf: NormalsOf | undefined = normalsOfEdge && ((segment) => normalsOfEdge(chain.edges[segment]!))
    const { points, lengthMm } = buildSeamPoints(chain, edges.edgeIds, model, faces, normalsOf)
    if (lengthMm < minLength) continue
    const { openingAngleDeg, medianAdjacentAreaMm2 } = describeChain(chain, edges, model, faces)
    seams.push({
      id: '',
      source,
      concavity: chain.edges.some((i) => edges.unknown[i] === 1) ? 'unknown' : 'known',
      jointType: 'fillet',
      confidence: confidence({ lengthMm, openingDeg: openingAngleDeg, medianAdjacentAreaMm2, diagonal: model.bounds.diagonal }),
      closed: chain.closed,
      lengthMm,
      openingAngleDeg,
      points,
    })
  }
  return seams
}

// Opening angle is the length-weighted mean of 180 - theta; the area is the median over the faces beside the seam.
function describeChain(chain: Chain, creases: CreaseEdges, model: MeshModel, faces: FaceData) {
  const { positions } = model.mesh
  let weighted = 0
  let total = 0
  const areas: number[] = []
  for (const index of chain.edges) {
    const edge = creases.edgeIds[index]!
    const a = model.edges.edgeA[edge]! * 3
    const b = model.edges.edgeB[edge]! * 3
    const length = Math.hypot(positions[a]! - positions[b]!, positions[a + 1]! - positions[b + 1]!, positions[a + 2]! - positions[b + 2]!)
    weighted += length * (180 - creases.dihedralDeg[index]!)
    total += length
    areas.push(faces.areas[model.edges.faceA[edge]!]!, faces.areas[model.edges.faceB[edge]!]!)
  }
  return { openingAngleDeg: weighted / total, medianAdjacentAreaMm2: median(areas) }
}

// Stable across runs and across settings that leave the seam unchanged: hashes the start, middle and end points
// and the length, each rounded to 0.1 mm.
function seamId(seam: RawSeam): string {
  const { points } = seam
  const pick = [points[0]!, points[points.length >> 1]!, points[points.length - 1]!]
  const key = [...pick.flatMap(({ p }) => p), seam.lengthMm].map((x) => Math.round(x * 10)).join(',')
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${seam.source}-${(hash >>> 0).toString(16).padStart(8, '0')}`
}
