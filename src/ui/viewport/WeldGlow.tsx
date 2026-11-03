import { useMemo } from 'react'
import { trailAlong, weldedUpTo } from '../../core/sequence/playback'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { selectSequenceOrder } from '../../state/selectors'
import { cssVar } from './cssVar'
import { lineSet, useDisposed } from './lineSet'

const WIDTH_PX = 5
// The glow is rebuilt this many times per second of playback time, not every frame.
const STEPS_PER_S = 10

// The part of every seam that has been welded so far, drawn bright and thick over the seam line, so the arcs glow as
// the playback goes. Nothing is drawn before the first arc starts.
export function WeldGlow() {
  const active = useStore((s) => s.activeStep === 'sequence' || s.activeStep === 'export')
  const data = useStore((s) => s.playback)
  const quantised = useStore((s) => Math.floor(s.timeS * STEPS_PER_S))
  const order = useStore(selectSequenceOrder)
  const seams = useVisibleSeams()

  const lines = useMemo(() => {
    if (!active || !data || quantised <= 0) return null
    const welded = weldedUpTo(data.path, data.timing, quantised / STEPS_PER_S)
    const byId = new Map(seams.map((s) => [s.id, s]))
    const parts: number[] = []
    for (const entry of order) {
      const seam = byId.get(entry.seamId)
      const length = welded[entry.seamId] ?? 0
      if (!seam || length <= 0) continue
      const trail = trailAlong(seam.points, seam.closed, entry.reversed && !seam.closed, length)
      for (let i = 0; i + 1 < trail.length; i++) parts.push(...trail[i]!, ...trail[i + 1]!)
    }
    return parts.length === 0 ? null : lineSet(new Float32Array(parts), { width: WIDTH_PX, color: cssVar('--warn'), renderOrder: 3 })
  }, [active, data, quantised, order, seams])
  useDisposed(lines)
  return lines ? <primitive object={lines} /> : null
}
