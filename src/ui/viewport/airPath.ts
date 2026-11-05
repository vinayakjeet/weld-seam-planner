import type { Vec3 } from '../../core/math/vec3'
import type { PlaybackPath } from '../../core/sequence/playback'

// The air moves of the plan as the torch flies them, the same stops poseAtTime follows: back along the tool axis from
// the last pose of a seam to its retract point, straight to the approach point of the next seam, and in to its first
// pose. The first move starts at home and the last one ends there. One polyline per move, seams + 1 of them.
export function airPolylines(path: PlaybackPath): Vec3[][] {
  const { seams, home } = path
  if (seams.length === 0) return []
  const moves: Vec3[][] = []
  for (let j = 0; j <= seams.length; j++) {
    const previous = j > 0 ? seams[j - 1]! : null
    const next = j < seams.length ? seams[j]! : null
    const stops: Vec3[] = []
    if (previous) stops.push(previous.poses[previous.poses.length - 1]!.position, previous.retract)
    else stops.push(home)
    if (next) stops.push(next.approach, next.poses[0]!.position)
    else stops.push(home)
    moves.push(stops)
  }
  return moves
}

// The same moves as line segments, two points of three numbers each, for a line set.
export function airSegmentPositions(path: PlaybackPath): Float32Array {
  const moves = airPolylines(path)
  const segments = moves.reduce((total, stops) => total + stops.length - 1, 0)
  const out = new Float32Array(segments * 6)
  let at = 0
  for (const stops of moves) {
    for (let i = 0; i + 1 < stops.length; i++) {
      out.set(stops[i]!, at)
      out.set(stops[i + 1]!, at + 3)
      at += 6
    }
  }
  return out
}
