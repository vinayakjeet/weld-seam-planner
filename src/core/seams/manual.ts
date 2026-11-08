import { add, dot, length, normalize, scale, sub, type Vec3 } from '../math/vec3'
import type { SeamCandidate } from './detect'
import type { SeamPoint } from './frames'

export interface ManualError {
  what: string
  why: string
  next: string
}

export const isManualError = (value: unknown): value is ManualError =>
  typeof value === 'object' && value !== null && 'what' in value && 'why' in value && 'next' in value && !('points' in value)

const MIN_END_MM = 2
const MIN_REMAINING_MM = 1
const SAME_POINT_MM = 1e-9
// Between two samples whose tangents differ by more than this a vertex lies in between, so the frame is not blended.
const SMOOTH_COS = Math.cos((20 * Math.PI) / 180)

const mm = (x: number) => `${x.toFixed(1)} mm`

const lerp = (a: Vec3, b: Vec3, f: number): Vec3 => add(scale(a, 1 - f), scale(b, f))
const blend = (a: Vec3, b: Vec3, f: number): Vec3 => {
  const v = normalize(lerp(a, b, f))
  return length(v) === 0 ? a : v
}

function pointAt(points: SeamPoint[], s: number): SeamPoint {
  let lo = 0
  let hi = points.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (points[mid]!.s <= s) lo = mid
    else hi = mid - 1
  }
  const a = points[lo]!
  const b = points[lo + 1]
  if (!b) return { ...a, s }
  const f = (s - a.s) / (b.s - a.s)
  const frame = dot(a.t, b.t) < SMOOTH_COS ? (f < 0.5 ? a : b) : null
  return {
    s,
    p: lerp(a.p, b.p, f),
    t: frame ? frame.t : blend(a.t, b.t, f),
    n1: frame ? frame.n1 : blend(a.n1, b.n1, f),
    n2: frame ? frame.n2 : blend(a.n2, b.n2, f),
  }
}

// The part of an open seam between two arc lengths, re-measured from its new start, with interpolated end points.
function slice(points: SeamPoint[], from: number, to: number): SeamPoint[] {
  const inside = points.filter((pt) => pt.s > from + SAME_POINT_MM && pt.s < to - SAME_POINT_MM)
  return [pointAt(points, from), ...inside, pointAt(points, to)].map((pt) => ({ ...pt, s: pt.s - from }))
}

function derive(seam: SeamCandidate, over: Partial<SeamCandidate> & Pick<SeamCandidate, 'id' | 'label' | 'points'>): SeamCandidate {
  const first = over.points[0]!
  const last = over.points[over.points.length - 1]!
  const closed = over.closed ?? false
  const lengthMm = closed ? last.s + length(sub(last.p, first.p)) : last.s
  return { ...seam, source: 'manual', hidden: false, closed, lengthMm, ...over }
}

export function splitSeam(seam: SeamCandidate, s: number): [SeamCandidate, SeamCandidate] | ManualError {
  if (seam.closed) {
    return {
      what: `Seam ${seam.label} cannot be split in two at one point.`,
      why: 'It is a closed loop, so one cut leaves a single seam with both ends at the cut.',
      next: 'Open the loop with one cut first, then cut the open seam where it should divide.',
    }
  }
  if (!(s >= MIN_END_MM && s <= seam.lengthMm - MIN_END_MM)) {
    return {
      what: `Seam ${seam.label} was not split.`,
      why: `A split at ${mm(s)} would leave a piece shorter than ${MIN_END_MM} mm on a seam that is ${mm(seam.lengthMm)} long.`,
      next: `Put the split point at least ${MIN_END_MM} mm from both ends.`,
    }
  }
  return [
    derive(seam, { id: `${seam.id}/a`, label: `${seam.label}a`, points: slice(seam.points, 0, s) }),
    derive(seam, { id: `${seam.id}/b`, label: `${seam.label}b`, points: slice(seam.points, s, seam.lengthMm) }),
  ]
}

// A closed loop cut at s: one open seam that starts and ends at the cut and runs the whole way round, keeping every
// sample of the loop. The arc length is measured from the cut.
export function openLoop(seam: SeamCandidate, s: number): SeamCandidate | ManualError {
  if (!seam.closed) {
    return {
      what: `Seam ${seam.label} is not a loop to open.`,
      why: 'It already has two ends.',
      next: 'Split it instead to divide it in two.',
    }
  }
  if (!(s >= 0 && s <= seam.lengthMm)) {
    return {
      what: `Seam ${seam.label} was not opened.`,
      why: `The cut at ${mm(s)} is not on the loop, which is ${mm(seam.lengthMm)} long.`,
      next: 'Put the cut on the loop.',
    }
  }
  const total = seam.lengthMm
  // The loop's first sample again at the end, so that the closing stretch can be cut and interpolated like any other.
  const ring = [...seam.points, { ...seam.points[0]!, s: total }]
  const cut = s >= total - SAME_POINT_MM ? 0 : s
  const before = slice(ring, cut, total)
  const after = cut <= SAME_POINT_MM ? [] : slice(ring, 0, cut).slice(1)
  const points = [...before, ...after.map((pt) => ({ ...pt, s: pt.s + total - cut }))]
  return derive(seam, { id: `${seam.id}/o`, label: seam.label, points, closed: false })
}

export function trimSeam(seam: SeamCandidate, startMm: number, endMm: number): SeamCandidate | ManualError {
  if (seam.closed) {
    return {
      what: `Seam ${seam.label} cannot be trimmed.`,
      why: 'It is a closed loop, so it has no start or end to cut back from.',
      next: 'Delete the loop and draw it again as an open seam.',
    }
  }
  if (!(startMm >= 0 && endMm >= 0)) {
    return {
      what: `Seam ${seam.label} was not trimmed.`,
      why: `The amounts to cut (${startMm} mm from the start, ${endMm} mm from the end) must both be zero or more.`,
      next: 'Enter zero or a positive length for each end.',
    }
  }
  const remaining = seam.lengthMm - startMm - endMm
  if (!(remaining >= MIN_REMAINING_MM)) {
    return {
      what: `Seam ${seam.label} was not trimmed.`,
      why: `Cutting ${mm(startMm)} and ${mm(endMm)} from ${mm(seam.lengthMm)} would leave ${mm(Math.max(0, remaining))}, less than the ${MIN_REMAINING_MM} mm a seam needs.`,
      next: 'Cut less from one or both ends.',
    }
  }
  return derive(seam, { id: `${seam.id}/t`, label: seam.label, points: slice(seam.points, startMm, seam.lengthMm - endMm) })
}

const reversedPoints = (seam: SeamCandidate): SeamPoint[] => {
  const flip = (pt: SeamPoint, s: number): SeamPoint => ({ s, p: pt.p, t: scale(pt.t, -1), n1: pt.n2, n2: pt.n1 })
  const { points, lengthMm } = seam
  if (!seam.closed) return points.map((pt) => flip(pt, lengthMm - pt.s)).reverse()
  // A loop keeps its first point first, so reversing twice restores the original order.
  return [flip(points[0]!, 0), ...points.slice(1).map((pt) => flip(pt, lengthMm - pt.s)).reverse()]
}

// Travel runs the other way; the normals swap so that n1 x n2 still points along the new tangent, and the thickness
// pair swaps with them.
export function reverseSeam(seam: SeamCandidate): SeamCandidate {
  const id = seam.id.endsWith('~r') ? seam.id.slice(0, -2) : `${seam.id}~r`
  return { ...seam, id, source: 'manual', points: reversedPoints(seam), thicknessMm: [seam.thicknessMm[1], seam.thicknessMm[0]] }
}

function joined(first: SeamPoint[], second: SeamPoint[]): SeamPoint[] {
  const end = first[first.length - 1]!
  const gap = length(sub(second[0]!.p, end.p))
  const rest = gap < SAME_POINT_MM ? second.slice(1) : second
  return [...first, ...rest.map((pt) => ({ ...pt, s: end.s + gap + (pt.s - second[0]!.s) }))]
}

// Seams that touch within toleranceMm become one. The second is reversed when its direction does not follow the first.
export function mergeSeams(a: SeamCandidate, b: SeamCandidate, toleranceMm: number): SeamCandidate | ManualError {
  const closedOne = a.closed ? a : b.closed ? b : null
  if (closedOne) {
    return {
      what: `Seams ${a.label} and ${b.label} cannot be merged.`,
      why: `Seam ${closedOne.label} is a closed loop, which has no free end to join to.`,
      next: 'Merge open seams only, or delete the loop and draw it again.',
    }
  }
  const aStart = a.points[0]!.p
  const aEnd = a.points[a.points.length - 1]!.p
  const bStart = b.points[0]!.p
  const bEnd = b.points[b.points.length - 1]!.p
  const options = [
    { gap: length(sub(aEnd, bStart)), build: () => joined(a.points, b.points) },
    { gap: length(sub(aEnd, bEnd)), build: () => joined(a.points, reversedPoints(b)) },
    { gap: length(sub(aStart, bStart)), build: () => joined(reversedPoints(b), a.points) },
    { gap: length(sub(aStart, bEnd)), build: () => joined(b.points, a.points) },
  ]
  const best = options.reduce((x, y) => (y.gap < x.gap ? y : x))
  if (!(best.gap <= toleranceMm)) {
    return {
      what: `Seams ${a.label} and ${b.label} cannot be merged.`,
      why: `Their nearest ends are ${mm(best.gap)} apart, more than the ${mm(toleranceMm)} merge tolerance.`,
      next: 'Choose two seams whose ends touch, or draw the missing stretch between them first.',
    }
  }

  let points = best.build()
  const closingGap = length(sub(points[points.length - 1]!.p, points[0]!.p))
  const closed = closingGap <= toleranceMm
  if (closed && closingGap < SAME_POINT_MM) points = points.slice(0, -1)

  const share = a.lengthMm / (a.lengthMm + b.lengthMm)
  return derive(a, {
    id: `${a.id}+${b.id}`,
    label: `${a.label}+${b.label}`,
    points,
    closed,
    confidence: Math.min(a.confidence, b.confidence),
    openingAngleDeg: a.openingAngleDeg * share + b.openingAngleDeg * (1 - share),
    concavity: a.concavity === 'known' && b.concavity === 'known' ? 'known' : 'unknown',
    approximateNormals: a.approximateNormals || b.approximateNormals ? true : undefined,
  })
}
