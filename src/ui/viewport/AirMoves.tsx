import { useMemo } from 'react'
import { homePoint } from '../../core/job/build'
import type { Vec3 } from '../../core/math/vec3'
import { selectPlan, selectSequenceOrder } from '../../state/selectors'
import { useStore } from '../../state/store'
import { cssVar } from './cssVar'
import { lineSet, useDisposed } from './lineSet'

const WIDTH_PX = 1.5

// Where the torch is when it starts and stops a seam, in the direction it is welded.
function endsOf(points: { p: Vec3 }[], closed: boolean, reversed: boolean): { start: Vec3; end: Vec3 } {
  const first = points[0]!.p
  const last = points[points.length - 1]!.p
  if (closed) return { start: first, end: first }
  return reversed ? { start: last, end: first } : { start: first, end: last }
}

// The air moves of the sequence as dashed lines: home to the first seam, from the end of each seam to the start of the
// next, and the last seam back home. Only in the Sequence step.
export function AirMoves() {
  const active = useStore((s) => s.activeStep === 'sequence')
  const plan = useStore(selectPlan)
  const order = useStore(selectSequenceOrder)
  const lines = useMemo(() => {
    if (!active || plan.seams.length === 0) return null
    const byId = new Map(plan.seams.map((p) => [p.seam.id, p.seam]))
    const path: Array<{ start: Vec3; end: Vec3 }> = []
    for (const entry of order) {
      const seam = byId.get(entry.seamId)
      if (seam && seam.points.length > 0) path.push(endsOf(seam.points, seam.closed, entry.reversed))
    }
    if (path.length === 0) return null
    const home = homePoint(plan)
    const stops: Vec3[] = [home]
    for (const { start, end } of path) stops.push(start, end)
    stops.push(home)
    // Each air move joins the end of one seam to the start of the next, so the stops pair up two at a time.
    const positions = new Float32Array((path.length + 1) * 6)
    for (let i = 0; i <= path.length; i++) {
      positions.set(stops[2 * i]!, i * 6)
      positions.set(stops[2 * i + 1]!, i * 6 + 3)
    }
    const { min, max } = plan.part.bbox
    const diagonal = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2])
    const dash = Math.max(1, diagonal / 120)
    return lineSet(positions, { width: WIDTH_PX, color: cssVar('--text-1'), renderOrder: 4, overlay: true, opacity: 0.85, dashed: { dashSize: dash, gapSize: dash } })
  }, [active, plan, order])
  useDisposed(lines)
  return lines ? <primitive object={lines} /> : null
}
