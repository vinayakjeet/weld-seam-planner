import { buildOrdered, homePoint } from '../job/build'
import type { Plan } from '../job/plan'
import type { PlanTiming } from '../job/timing'
import { normalizeQuat, slerp, type Quat } from '../math/quat'
import { length, sub, type Vec3 } from '../math/vec3'
import { timelineSegments } from './timeline'

export interface PathPose {
  s: number
  position: Vec3
  quaternion: Quat
}

export interface PathSeam {
  seamId: string
  // Along the direction the seam is welded, as exported.
  poses: PathPose[]
  // The torch points of the air move before and after the seam.
  approach: Vec3
  retract: Vec3
}

export interface PlaybackPath {
  home: Vec3
  seams: PathSeam[]
}

export interface PlaybackPose {
  position: Vec3
  quaternion: Quat
  kind: 'arc' | 'air'
  // The seam being welded, the seam an air move goes to, or home for the move back.
  seamId: string
  // Arc length along the seam for an arc, 0 in the air.
  s: number
}

// The torch path of the plan in its sequence order, built from the same seams the export is.
export function playbackPathOf(plan: Plan): PlaybackPath {
  return {
    home: homePoint(plan),
    seams: buildOrdered(plan).map((built) => ({
      seamId: built.seam.id,
      poses: built.seam.poses.map((pose) => ({ s: pose.s, position: [...pose.position] as Vec3, quaternion: [...pose.quaternion] as Quat })),
      approach: built.firstApproach,
      retract: built.lastRetract,
    })),
  }
}

// The length of the playback: arc time plus air time, the same as the end of the timeline.
export const playbackTotalS = (timing: PlanTiming): number => timing.arcTimeS + timing.airTimeS

const IDENTITY: Quat = [0, 0, 0, 1]

const lerpVec = (a: Vec3, b: Vec3, f: number): Vec3 => (f <= 0 ? [...a] : f >= 1 ? [...b] : [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f])

// A unit quaternion on the w >= 0 side, which is the same rotation as its negative.
function tidy(q: Quat): Quat {
  const n = normalizeQuat(q)
  return n[3] < 0 ? [-n[0] + 0, -n[1] + 0, -n[2] + 0, -n[3] + 0] : n
}

function lerpQuat(a: Quat, b: Quat, f: number): Quat {
  return tidy(f <= 0 ? a : f >= 1 ? b : slerp(a, b, f))
}

function poseAtS(poses: PathPose[], s: number): { position: Vec3; quaternion: Quat } {
  const first = poses[0]!
  const last = poses[poses.length - 1]!
  if (s <= first.s) return { position: [...first.position], quaternion: tidy(first.quaternion) }
  if (s >= last.s) return { position: [...last.position], quaternion: tidy(last.quaternion) }
  let lo = 0
  let hi = poses.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (poses[mid]!.s <= s) lo = mid
    else hi = mid
  }
  const a = poses[lo]!
  const b = poses[hi]!
  const f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0
  return { position: lerpVec(a.position, b.position, f), quaternion: lerpQuat(a.quaternion, b.quaternion, f) }
}

function alongPolyline(points: Vec3[], fraction: number): Vec3 {
  const lengths = points.slice(1).map((p, i) => length(sub(p, points[i]!)))
  const total = lengths.reduce((a, b) => a + b, 0)
  if (!(total > 0) || fraction <= 0) return [...points[0]!]
  if (fraction >= 1) return [...points[points.length - 1]!]
  let remaining = fraction * total
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]! || i === lengths.length - 1) return lerpVec(points[i]!, points[i + 1]!, lengths[i]! > 0 ? remaining / lengths[i]! : 1)
    remaining -= lengths[i]!
  }
  return [...points[points.length - 1]!]
}

const clampTime = (t: number, total: number) => (Number.isFinite(t) ? Math.min(Math.max(t, 0), total) : 0)

// Where the torch is at time t of the playback. An arc interpolates the seam's poses by the share of its arc time that
// has passed. An air move follows the path the export measures: back along the tool axis from the last pose to the
// retract point, straight to the approach point of the next seam, and in to its first pose, at a constant speed; home
// is the start and the end. A time outside 0 to the total is clamped.
export function poseAtTime(path: PlaybackPath, timing: PlanTiming, t: number): PlaybackPose {
  const n = path.seams.length
  if (n === 0) return { position: [...path.home], quaternion: [...IDENTITY], kind: 'air', seamId: 'home', s: 0 }
  const segments = timelineSegments(timing)
  const total = segments[segments.length - 1]!.t1
  const time = clampTime(t, total)
  let k = segments.findIndex((segment) => time < segment.t1)
  if (k < 0) k = segments.length - 1
  const segment = segments[k]!
  const span = segment.t1 - segment.t0
  const f = span > 0 ? Math.min(Math.max((time - segment.t0) / span, 0), 1) : 1

  if (segment.kind === 'arc') {
    const seam = path.seams[(k - 1) / 2]!
    const length = seam.poses[seam.poses.length - 1]!.s
    const s = f * length
    return { ...poseAtS(seam.poses, s), kind: 'arc', seamId: seam.seamId, s }
  }

  const j = k / 2
  const prev = j > 0 ? path.seams[j - 1]! : null
  const next = j < n ? path.seams[j]! : null
  const prevLast = prev?.poses[prev.poses.length - 1]
  const nextFirst = next?.poses[0]
  const stops: Vec3[] = []
  if (prev && prevLast) stops.push(prevLast.position, prev.retract)
  else stops.push(path.home)
  if (next && nextFirst) stops.push(next.approach, nextFirst.position)
  else stops.push(path.home)
  const qa = prevLast?.quaternion ?? nextFirst!.quaternion
  const qb = nextFirst?.quaternion ?? prevLast!.quaternion
  return { position: alongPolyline(stops, f), quaternion: lerpQuat(qa, qb, f), kind: 'air', seamId: segment.seamId, s: 0 }
}

// Arc length welded of every seam at time t; 0 before its arc starts, the whole length once it has stopped.
export function weldedUpTo(path: PlaybackPath, timing: PlanTiming, t: number): Record<string, number> {
  const segments = timelineSegments(timing)
  const welded: Record<string, number> = Object.fromEntries(path.seams.map((s) => [s.seamId, 0]))
  if (segments.length === 0) return welded
  const time = clampTime(t, segments[segments.length - 1]!.t1)
  const lengths = new Map(path.seams.map((s) => [s.seamId, s.poses[s.poses.length - 1]!.s]))
  for (const segment of segments) {
    if (segment.kind !== 'arc') continue
    const seamLength = lengths.get(segment.seamId) ?? 0
    if (time >= segment.t1) welded[segment.seamId] = seamLength
    else if (time > segment.t0) welded[segment.seamId] = ((time - segment.t0) / (segment.t1 - segment.t0)) * seamLength
  }
  return welded
}

// The seam polyline from where its arc starts to welded mm along it, for the glow of the welded part. reversed starts
// from the far end; a loop continues round its closing segment.
export function trailAlong(points: ReadonlyArray<{ s: number; p: Vec3 }>, closed: boolean, reversed: boolean, weldedMm: number): Vec3[] {
  if (points.length === 0) return []
  let ring = points.map((point) => point.p)
  if (closed) ring = [...ring, points[0]!.p]
  if (reversed) ring = ring.slice().reverse()
  const out: Vec3[] = [[...ring[0]!]]
  let remaining = weldedMm
  for (let i = 0; i + 1 < ring.length && remaining > 0; i++) {
    const a = ring[i]!
    const b = ring[i + 1]!
    const len = length(sub(b, a))
    if (remaining >= len) {
      out.push([...b])
      remaining -= len
    } else {
      out.push(lerpVec(a, b, remaining / len))
      break
    }
  }
  return out
}
