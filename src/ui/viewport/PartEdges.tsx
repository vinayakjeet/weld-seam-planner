import { BufferAttribute, BufferGeometry } from 'three'
import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { useStore } from '../../state/store'
import { cssVar } from './cssVar'
import { edgesAllowed, featureEdgePositions } from './featureEdges'
import { lineSet } from './lineSet'
import type { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import type { DisplayData } from '../../worker/geometry.api'

// Faces meeting at more than this are drawn as an edge.
const EDGE_THRESHOLD_DEG = 30
const EDGE_WIDTH_PX = 1
const EDGE_OPACITY = 0.5
const FIRST_PAINT_DELAY_MS = 300

// The part's outline and creases as thin, half see-through lines, so its shape reads without competing with the seams. They
// are for the eye only: nothing can pick them.
export function PartEdges() {
  const display = useStore((s) => s.display)
  const invalidate = useThree((state) => state.invalidate)
  // The lines are kept with the part they were made for, so a new part never shows the old part's edges while its own are made.
  const [built, setBuilt] = useState<{ display: DisplayData; lines: LineSegments2 } | null>(null)

  // Finding the edges of a large part takes a pass over every triangle. It waits until the part has been drawn once, so the
  // part appears first and the edges follow, instead of the whole page waiting for them.
  useEffect(() => {
    if (!display || !edgesAllowed(display.indices.length / 3)) return
    let made: LineSegments2 | null = null
    const later = setTimeout(() => {
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(display.positions, 3))
      geometry.setIndex(new BufferAttribute(display.indices, 1))
      const positions = featureEdgePositions(geometry, EDGE_THRESHOLD_DEG)
      geometry.dispose()
      if (positions.length === 0) return
      made = lineSet(positions, { width: EDGE_WIDTH_PX, color: cssVar('--part-edge'), opacity: EDGE_OPACITY, renderOrder: -2 })
      made.raycast = () => {}
      made.material.depthWrite = false
      setBuilt({ display, lines: made })
      invalidate()
    }, FIRST_PAINT_DELAY_MS)
    return () => {
      clearTimeout(later)
      made?.geometry.dispose()
      made?.material.dispose()
    }
  }, [display, invalidate])
  return built && built.display === display ? <primitive object={built.lines} /> : null
}
