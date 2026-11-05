import type { MeshBVH } from 'three-mesh-bvh'
import { dot, length, normalize, sub, type Vec3 } from '../math/vec3'
import { computeFaceData, type FaceData } from '../mesh/faces'
import { LARGE_PART_TRIANGLES } from '../mesh/health'
import type { MeshModel } from '../mesh/model'
import type { PlateThickness } from '../process/filletRules'
import { buildBodyBvhs, insideByParity, wholeBvhFor, type BodyBvh } from './bodyBvh'
import { chainEdges, edgeEnds, type Chain } from './chain'
import { acrossFace, classifyJoint, isLap, meetsSecondPlate, patchWidth, thicknessBehind, type JointType } from './classify'
import { confidence } from './confidence'
import { contactTolerance, findContactEdges, type ContactEdges } from './contact'
import { extractCreaseEdges, type CreaseEdges, type CreaseResult } from './crease'
import { buildSeamPoints, pointsFromPolyline, type NormalsOf, type SeamPoint } from './frames'
import { chainSegments, findIntersectionSegments } from './intersect'
import { extractNonManifoldWedges, openBodies, type SolidTest } from './nonManifold'
import { cornerThickness, probeFromBvhs, roundDecimals, seamThickness, type RayProbe } from './thickness'

export interface DetectSettings {
  creaseAngleDeg: number
}

export const DEFAULT_DETECT_SETTINGS: DetectSettings = { creaseAngleDeg: 30 }

// Passes that need per-body BVHs reuse these when given; otherwise they build their own.
export interface DetectContext {
  bodyBvhs?: BodyBvh[]
  // The whole-mesh BVH of a single-body part, or null when there is none to use (too large). Built here when absent.
  wholeBvh?: BodyBvh | null
  // Above this many triangles the outside corner pass is skipped. LARGE_PART_TRIANGLES when absent.
  maxCornerTriangles?: number
}

export type SeamSource = 'crease' | 'contact' | 'intersection' | 'nonmanifold' | 'manual'

export interface SeamCandidate {
  id: string
  label: string
  source: SeamSource
  // Unknown when the body has no known inside, so a fillet could equally be a convex corner.
  concavity: 'known' | 'unknown'
  jointType: JointType
  // Corner candidates are found but kept out of the list, counts and accept all until the user asks for them.
  hidden: boolean
  confidence: number
  closed: boolean
  lengthMm: number
  openingAngleDeg: number
  points: SeamPoint[]
  // Thickness of the plates behind n1 and n2, in mm; null where it could not be measured.
  thicknessMm: PlateThickness
  // Drawn across open surface: n1 and n2 are the surface normal there, not the two plates of a joint.
  approximateNormals?: boolean
  // Manual seams only: the id of the detected seam whose row in the table this seam takes over after an edit.
  slot?: string
}

const TURN_BREAK_DEG = 40
const MIN_LENGTH_MM = 10
const MIN_LENGTH_FRACTION = 0.01

type RawSeam = Omit<SeamCandidate, 'label'>

export function detectSeams(model: MeshModel, settings: DetectSettings, context: DetectContext = {}): SeamCandidate[] {
  const faces = computeFaceData(model.mesh)
  const minLength = Math.max(MIN_LENGTH_MM, MIN_LENGTH_FRACTION * model.bounds.diagonal)
  const bvhs = model.bodies.count > 1 ? (context.bodyBvhs ?? buildBodyBvhs(model)) : []
  let whole = context.wholeBvh
  const wholeBvh = () => (whole === undefined ? (whole = wholeBvhFor(model)) : whole)
  const bvhOf = (body: number) => bvhs[body]?.bvh ?? wholeBvh()?.bvh ?? null
  const strips = stripProbe(model, faces, bvhOf)

  let probe: RayProbe | null | undefined
  const rayProbe = () => {
    if (probe === undefined) {
      const found = bvhs.length > 0 ? bvhs : [wholeBvh()].filter((b): b is BodyBvh => b !== null)
      probe = found.length > 0 ? probeFromBvhs(found.map((b) => b.bvh)) : null
    }
    return probe
  }
  const depthMm = Math.min(MAX_CORNER_DEPTH_MM, CORNER_DEPTH_FRACTION * model.bounds.diagonal)
  const thicknessOf: ThicknessOf = (points, jointType, strip) => {
    const ray = rayProbe()
    if (!ray) return [null, null]
    if (jointType === 'corner') return cornerThickness(points, ray, depthMm)
    const pair = seamThickness(points, ray)
    const mid = points[points.length >> 1]
    // A lap's strip face is its end face, so its plate thickness is the width of that face, not a ray through it.
    if (jointType === 'lap' && strip.stripNormal && mid && Number.isFinite(strip.stripWidthMm)) {
      pair[dot(mid.n1, strip.stripNormal) >= dot(mid.n2, strip.stripNormal) ? 0 : 1] = roundDecimals(strip.stripWidthMm, 2)
    }
    return pair
  }

  const creases = extractCreaseEdges(model, faces, settings.creaseAngleDeg)
  const contact = bvhs.length > 1 ? findContactEdges(model, faces, bvhs, settings.creaseAngleDeg) : null

  const found: RawSeam[] = seamsFromEdges('crease', creases, model, faces, minLength, {
    thicknessOf,
    jointOf: (edge, seam) => {
      const strip = strips.ofCrease(creases.edgeIds[edge]!)
      return { jointType: classifyJoint({ source: 'crease', ...seam, ...strip, convex: false }), strip }
    },
  })
  if (model.mesh.triangleCount <= (context.maxCornerTriangles ?? LARGE_PART_TRIANGLES)) {
    found.push(...cornerSeams(model, faces, creases, contact, minLength, rayProbe, depthMm, thicknessOf))
  }
  found.push(...nonManifoldSeams(model, faces, settings, minLength, bvhOf, thicknessOf))

  if (contact) {
    const touching = contactSeams(model, faces, contact, minLength, strips, thicknessOf)
    found.push(...dropDuplicateSeams(touching, contactTolerance(model.bounds.diagonal)), ...intersectionSeams(model, bvhs, minLength, thicknessOf))
  }

  for (const seam of found) seam.id = seamId(seam)
  found.sort(
    (a, b) =>
      Number(a.hidden) - Number(b.hidden) ||
      Math.round(b.lengthMm * 1000) - Math.round(a.lengthMm * 1000) ||
      a.id.localeCompare(b.id),
  )

  const used = new Set<string>()
  return found.map((seam, i) => {
    let id = seam.id
    for (let n = 2; used.has(id); n++) id = `${seam.id}-${n}`
    used.add(id)
    return { ...seam, id, label: `S${i + 1}` }
  })
}

// Under-face depth of the rays across a corner face: deep enough to clear float noise on a part far from the origin,
// shallow against the thinnest sheet.
const CORNER_DEPTH_FRACTION = 1e-4
const MAX_CORNER_DEPTH_MM = 0.05

// Outside corners where a second plate meets the first. The edges of a single plate are convex creases too but
// join nothing, so a chain is kept only when the plate check passes at its middle point; with no ray to cast there is
// no check, and no candidate.
function cornerSeams(
  model: MeshModel,
  faces: FaceData,
  creases: CreaseResult,
  contact: ContactEdges | null,
  minLength: number,
  rayProbe: () => RayProbe | null,
  depthMm: number,
  thicknessOf: ThicknessOf,
): RawSeam[] {
  // A convex edge that is a contact seam is already listed as one, so it is not a corner as well.
  const taken = new Set(contact?.edgeIds)
  const outside = creases.convex.edgeIds.filter((e) => !taken.has(e))
  if (outside.length === 0) return []
  const probe = rayProbe()
  if (!probe) return []
  const corners: CreaseEdges = {
    edgeIds: outside,
    dihedralDeg: creases.convex.dihedralDeg.filter((_, i) => !taken.has(creases.convex.edgeIds[i]!)),
    unknown: new Uint8Array(outside.length),
  }
  return seamsFromEdges('crease', corners, model, faces, minLength, {
    thicknessOf,
    keep: ({ points }) => meetsSecondPlate(points[points.length >> 1]!, probe, depthMm),
    jointOf: (_, seam) => ({ jointType: classifyJoint({ source: 'crease', ...seam, ...NO_STRIP, convex: true }), strip: NO_STRIP }),
  })
}

const SAME_SIDE_COS = Math.SQRT1_2

// Each body reads its own edges, so one line can come back from both bodies. Two seams are one when every point of
// the shorter lies within the tolerance of the longer and their bisectors lean the same way (within 45 degrees); the
// longer is kept, the first on a tie, and the order is kept. Seams along one line facing opposite ways are two welds.
export function dropDuplicateSeams<T extends Pick<SeamCandidate, 'lengthMm' | 'closed' | 'points'>>(seams: T[], toleranceMm: number): T[] {
  const bisector = (seam: T): Vec3 => {
    const sum: Vec3 = [0, 0, 0]
    for (const { n1, n2 } of seam.points) for (let c = 0; c < 3; c++) sum[c]! += n1[c]! + n2[c]!
    return normalize(sum)
  }
  const onLine = (p: Vec3, seam: T) => {
    const { points } = seam
    const count = seam.closed ? points.length : points.length - 1
    for (let i = 0; i < count; i++) if (segmentDistance(p, points[i]!.p, points[(i + 1) % points.length]!.p) <= toleranceMm) return true
    return points.length === 1 && length(sub(p, points[0]!.p)) <= toleranceMm
  }
  const box = (seam: T) => {
    const lo: Vec3 = [Infinity, Infinity, Infinity]
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
    for (const { p } of seam.points) for (let c = 0; c < 3; c++) [lo[c], hi[c]] = [Math.min(lo[c]!, p[c]!), Math.max(hi[c]!, p[c]!)]
    return { lo, hi }
  }
  const sides = seams.map(bisector)
  const boxes = seams.map(box)
  const inside = (i: number, k: number) => [0, 1, 2].every((c) => boxes[i]!.lo[c]! >= boxes[k]!.lo[c]! - toleranceMm && boxes[i]!.hi[c]! <= boxes[k]!.hi[c]! + toleranceMm)
  const order = seams.map((_, i) => i).sort((a, b) => seams[b]!.lengthMm - seams[a]!.lengthMm || a - b)
  const kept: number[] = []
  for (const i of order) {
    const twin = kept.some(
      (k) => dot(sides[i]!, sides[k]!) > SAME_SIDE_COS && inside(i, k) && seams[i]!.points.every(({ p }) => onLine(p, seams[k]!)),
    )
    if (!twin) kept.push(i)
  }
  return kept.sort((a, b) => a - b).map((i) => seams[i]!)
}

function segmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a)
  const span = dot(ab, ab)
  const f = span === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / span))
  return length(sub(p, [a[0] + ab[0] * f, a[1] + ab[1] * f, a[2] + ab[2] * f]))
}

// The plate normals of a contact seam are the free face of the touching body and the surface it touches, so the
// opening angle is measured between those two, not between the two faces of the touching body's own edge.
function contactSeams(
  model: MeshModel,
  faces: FaceData,
  contact: ContactEdges,
  minLength: number,
  strips: StripProbe,
  thicknessOf: ThicknessOf,
): RawSeam[] {
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
  return seamsFromEdges('contact', { edgeIds: contact.edgeIds, dihedralDeg, unknown }, model, faces, minLength, {
    normalsOfEdge,
    thicknessOf,
    jointOf: (k, seam) => {
      const strip = strips.ofContact(contact, k)
      return { jointType: classifyJoint({ source: 'contact', ...seam, ...strip, convex: false }), strip }
    },
  })
}

// Wedges of one edge run along the same line, so each rank is chained on its own; chaining them together would
// join the two coincident seams of a fused T into a loop.
function nonManifoldSeams(
  model: MeshModel,
  faces: FaceData,
  settings: DetectSettings,
  minLength: number,
  bvhOf: (body: number) => MeshBVH | null,
  thicknessOf: ThicknessOf,
): RawSeam[] {
  if (model.edges.stats.nonManifold === 0) return []
  const open = openBodies(model)
  const solid: SolidTest = (p, body) => {
    const bvh = open[body] ? null : bvhOf(body)
    return bvh ? insideByParity(bvh, p) : null
  }
  const wedges = extractNonManifoldWedges(model, settings.creaseAngleDeg, solid)
  const seams: RawSeam[] = []
  for (let rank = 0; wedges.some((w) => w.rank >= rank); rank++) {
    const group = wedges.filter((w) => w.rank === rank)
    const edges: CreaseEdges = {
      edgeIds: Uint32Array.from(group, (w) => w.edge),
      dihedralDeg: Float32Array.from(group, (w) => 180 - w.openingDeg),
      unknown: new Uint8Array(group.length),
    }
    seams.push(...seamsFromEdges('nonmanifold', edges, model, faces, minLength, { normalsOfEdge: (k) => [group[k]!.n1, group[k]!.n2], thicknessOf }))
  }
  return seams
}

const WELD_FRACTION = 1e-4
const MIN_WELD_MM = 0.001

// Intersection chains are not mesh edges, so they carry their own plate normals and triangle areas. The opening angle
// is the length-weighted mean of 180 minus the angle between the two outward triangle normals.
function intersectionSeams(model: MeshModel, bvhs: BodyBvh[], minLength: number, thicknessOf: ThicknessOf): RawSeam[] {
  const { diagonal } = model.bounds
  const segments = findIntersectionSegments(model, bvhs, contactTolerance(diagonal))
  const seams: RawSeam[] = []
  for (const line of chainSegments(segments, Math.max(WELD_FRACTION * diagonal, MIN_WELD_MM))) {
    const { points, lengthMm, surface = points } = pointsFromPolyline(line.points, line.closed, (segment) => line.normals[segment]!, { smooth: true })
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
    const jointType = classifyJoint({ source: 'intersection', closed: line.closed, points, ...NO_STRIP, convex: false })
    seams.push({
      id: '',
      source: 'intersection',
      concavity: 'known',
      jointType,
      hidden: false,
      confidence: confidence({ lengthMm, openingDeg: openingAngleDeg, medianAdjacentAreaMm2: median(line.areas), diagonal }),
      closed: line.closed,
      lengthMm,
      openingAngleDeg,
      points,
      thicknessMm: thicknessOf(surface, jointType, NO_STRIP),
    })
  }
  return seams
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

// Where a joint's strip face is and how wide it is, when the joint is a strip on a plate.
type ThicknessOf = (points: SeamPoint[], jointType: JointType, strip: Strip) => PlateThickness

interface JointInfo {
  jointType: JointType
  strip: Strip
}

interface EdgeOptions {
  thicknessOf: ThicknessOf
  // Plate normals per entry of the edge list, when they are not the normals of the mesh faces beside the edge.
  normalsOfEdge?: (edge: number) => [Vec3, Vec3]
  // Joint type of a chain, decided from its middle entry of the edge list. Fillet when absent.
  jointOf?: (edge: number, seam: { closed: boolean; points: SeamPoint[] }) => JointInfo
  // Whether a chain that is long enough is a seam at all. Every chain is when absent.
  keep?: (seam: { closed: boolean; points: SeamPoint[] }) => boolean
}

// Chains the edges, drops chains under minLength and describes the rest. Edge numbers in the options index the edge list.
function seamsFromEdges(
  source: SeamSource,
  edges: CreaseEdges,
  model: MeshModel,
  faces: FaceData,
  minLength: number,
  { normalsOfEdge, jointOf, thicknessOf, keep }: EdgeOptions,
): RawSeam[] {
  const chains = chainEdges(model.mesh.positions, edgeEnds(model.edges, edges.edgeIds), TURN_BREAK_DEG)
  const seams: RawSeam[] = []
  for (const chain of chains) {
    const normalsOf: NormalsOf | undefined = normalsOfEdge && ((segment) => normalsOfEdge(chain.edges[segment]!))
    const { points, lengthMm, surface = points } = buildSeamPoints(chain, edges.edgeIds, model, faces, normalsOf, { smooth: true })
    if (lengthMm < minLength) continue
    if (keep && !keep({ closed: chain.closed, points: surface })) continue
    const { openingAngleDeg, medianAdjacentAreaMm2 } = describeChain(chain, edges, model, faces)
    const { jointType, strip } = jointOf
      ? jointOf(chain.edges[chain.edges.length >> 1]!, { closed: chain.closed, points })
      : { jointType: 'fillet' as const, strip: NO_STRIP }
    seams.push({
      id: '',
      source,
      concavity: chain.edges.some((i) => edges.unknown[i] === 1) ? 'unknown' : 'known',
      jointType,
      hidden: jointType === 'corner',
      confidence: confidence({ lengthMm, openingDeg: openingAngleDeg, medianAdjacentAreaMm2, diagonal: model.bounds.diagonal }),
      closed: chain.closed,
      lengthMm,
      openingAngleDeg,
      points,
      thicknessMm: thicknessOf(surface, jointType, strip),
    })
  }
  return seams
}

interface Strip {
  stripWidthMm: number
  touchedThicknessMm: number
  // Depth of the plate behind the strip, measured from the middle of the strip face.
  stripLengthMm: number
  // Normal of the strip's free face, to tell which of a seam's two plates is the strip.
  stripNormal: Vec3 | null
}

const NO_STRIP: Strip = { stripWidthMm: Infinity, touchedThicknessMm: Infinity, stripLengthMm: Infinity, stripNormal: null }

// The lap rule needs the width of the free face's flat patch, the thickness of the plate behind the touched surface
// and the depth of the plate behind the free face. A patch wider than a tenth of the part is a wall, not a strip, so it costs no ray and, in a single body,
// no BVH. A single body shares one BVH over the whole mesh with the thickness rays, unless the mesh is large.
// The ray starts on the junction line itself; a ray along a face plane still registers the edge it grazes.
const STRIP_CAP_FRACTION = 0.1

interface StripProbe {
  ofCrease: (edge: number) => Strip
  ofContact: (contact: ContactEdges, k: number) => Strip
}

function stripProbe(model: MeshModel, faces: FaceData, bvhOf: (body: number) => MeshBVH | null): StripProbe {
  const { diagonal } = model.bounds
  const { positions } = model.mesh
  const { normals } = faces
  const cap = STRIP_CAP_FRACTION * diagonal
  const faceNormal = (f: number): Vec3 => [normals[f * 3]!, normals[f * 3 + 1]!, normals[f * 3 + 2]!]

  // Free face x on the seam at mid with tangent t, touched surface with normal nY in the given body.
  const measure = (x: number, nY: Vec3, body: number, mid: Vec3, t: Vec3): Strip => {
    const widthMm = patchWidth(model, faces, x, mid, t, cap)
    if (widthMm > cap) return NO_STRIP
    const bvh = bvhOf(body)
    const own = bvhOf(model.bodies.triangleBody[x]!)
    const across = acrossFace(faces, x, mid, t)
    if (!bvh || !own || !across) return NO_STRIP
    const middle: Vec3 = [mid[0] + across[0] * (widthMm / 2), mid[1] + across[1] * (widthMm / 2), mid[2] + across[2] * (widthMm / 2)]
    return {
      stripWidthMm: widthMm,
      touchedThicknessMm: thicknessBehind(bvh, mid, nY),
      stripLengthMm: thicknessBehind(own, middle, faceNormal(x)),
      stripNormal: faceNormal(x),
    }
  }
  const ratio = (m: Strip) => (Number.isFinite(m.touchedThicknessMm) ? m.stripWidthMm / m.touchedThicknessMm : Infinity)
  const lap = (m: Strip) => isLap(m.stripWidthMm, m.touchedThicknessMm, m.stripLengthMm)
  const ends = (e: number): { mid: Vec3; t: Vec3 } => {
    const a = model.edges.edgeA[e]! * 3
    const b = model.edges.edgeB[e]! * 3
    const p: Vec3 = [positions[a]!, positions[a + 1]!, positions[a + 2]!]
    const q: Vec3 = [positions[b]!, positions[b + 1]!, positions[b + 2]!]
    return { mid: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], t: normalize(sub(q, p)) }
  }

  return {
    // Either face may be the free one, so both readings are measured; a reading that makes a lap wins, then the
    // narrower strip.
    ofCrease(edge) {
      const { mid, t } = ends(edge)
      const { faceA, faceB } = model.edges
      let best = NO_STRIP
      for (const [x, y] of [[faceA[edge]!, faceB[edge]!], [faceB[edge]!, faceA[edge]!]] as const) {
        const m = measure(x, faceNormal(y), model.bodies.triangleBody[y]!, mid, t)
        if (Number(lap(m)) - Number(lap(best)) > 0 || (lap(m) === lap(best) && ratio(m) < ratio(best))) best = m
      }
      return best
    },
    ofContact(contact, k) {
      const { mid, t } = ends(contact.edgeIds[k]!)
      const o = k * 3
      const touched: Vec3 = [contact.touchedNormal[o]!, contact.touchedNormal[o + 1]!, contact.touchedNormal[o + 2]!]
      return measure(contact.freeFace[k]!, touched, contact.touchedBody[k]!, mid, t)
    },
  }
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
