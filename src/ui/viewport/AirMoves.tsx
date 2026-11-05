import { useMemo } from 'react'
import { homePoint } from '../../core/job/build'
import type { Vec3 } from '../../core/math/vec3'
import { selectPlan, selectSequenceOrder } from '../../state/selectors'
import { useStore } from '../../state/store'
import { cssVar } from './cssVar'
import { airSegmentPositions } from './airPath'
import { lineSet, useDisposed } from './lineSet'

const WIDTH_PX = 1.5

// Where the torch is when it starts and stops a seam, in the direction it is welded.
function endsOf(points: { p: Vec3 }[], closed: boolean, reversed: boolean): { start: Vec3; end: Vec3 } {
  const first = points[0]!.p
  const last = points[points.length - 1]!.p
  if (closed) return { start: first, end: first }
  return reversed ? { start: last, end: first } : { start: first, end: last }
}

// One segment per air move, from the end of one seam to the start of the next, with home at both ends.
function straightMoves(path: Array<{ start: Vec3; end: Vec3 }>, home: Vec3): Float32Array {
  const stops: Vec3[] = [home]
  for (const { start, end } of path) stops.push(start, end)
  stops.push(home)
  const positions = new Float32Array((path.length + 1) * 6)
  for (let i = 0; i <= path.length; i++) {
    positions.set(stops[2 * i]!, i * 6)
    positions.set(stops[2 * i + 1]!, i * 6 + 3)
  }
  return positions
}

// The air moves of the sequence as dashed lines: home to the first seam, from each seam to the next, and the last seam back
// home, through the retract and approach points the torch flies through. Only in the Sequence step. The torch path comes
// from the worker a moment after an edit; until then the moves are drawn straight between the seam ends.
export function AirMoves() {
  const active = useStore((s) => s.activeStep === 'sequence')
  const plan = useStore(selectPlan)
  const order = useStore(selectSequenceOrder)
  const playback = useStore((s) => (s.playbackFor === selectPlan(s) ? s.playback : null))
  // The dashes take the text colour, which changes with the theme. Reading it here makes the lines follow it.
  useStore((s) => s.theme)
  const colour = cssVar('--text-1')
  const lines = useMemo(() => {
    if (!active || plan.seams.length === 0) return null
    const byId = new Map(plan.seams.map((p) => [p.seam.id, p.seam]))
    const path: Array<{ start: Vec3; end: Vec3 }> = []
    for (const entry of order) {
      const seam = byId.get(entry.seamId)
      if (seam && seam.points.length > 0) path.push(endsOf(seam.points, seam.closed, entry.reversed))
    }
    if (path.length === 0) return null
    const positions = playback ? airSegmentPositions(playback.path) : straightMoves(path, homePoint(plan))
    const { min, max } = plan.part.bbox
    const diagonal = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2])
    const dash = Math.max(1, diagonal / 120)
    return lineSet(positions, { width: WIDTH_PX, color: colour, renderOrder: 4, overlay: true, opacity: 0.85, dashed: { dashSize: dash, gapSize: dash } })
  }, [active, plan, order, playback, colour])
  useDisposed(lines)
  return lines ? <primitive object={lines} /> : null
}
