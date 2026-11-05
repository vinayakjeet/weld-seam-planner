import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { useStore } from '../../state/store'
import { cssVar } from './cssVar'
import { lineSet } from './lineSet'

const EDGE_WIDTH_PX = 1
const EDGE_OPACITY = 0.5

// The part's outline and creases as thin, half see-through lines, so its shape reads without competing with the seams. The
// worker finds them while it loads the part, relative to the display origin like the mesh. They are for the eye only:
// nothing can pick them.
export function PartEdges() {
  const display = useStore((s) => s.display)
  const invalidate = useThree((state) => state.invalidate)
  const lines = useMemo(() => {
    if (!display || display.edges.length === 0) return null
    const made = lineSet(display.edges, { width: EDGE_WIDTH_PX, color: cssVar('--part-edge'), opacity: EDGE_OPACITY, renderOrder: -2 })
    made.raycast = () => {}
    made.material.depthWrite = false
    return made
  }, [display])
  useEffect(() => {
    invalidate()
    return () => {
      lines?.geometry.dispose()
      lines?.material.dispose()
    }
  }, [lines, invalidate])
  return lines ? <primitive object={lines} /> : null
}
