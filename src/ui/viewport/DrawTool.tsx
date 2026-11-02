import { useThree } from '@react-three/fiber'
import { useMemo, useState, type RefObject } from 'react'
import { Raycaster, Vector2, type Mesh } from 'three'
import type { Vec3 } from '../../core/math/vec3'
import { toolEvent } from '../../state/flows'
import { useStore } from '../../state/store'
import { getGeometryClient } from '../../worker/client'
import { cssVar } from './cssVar'
import { lineSet, useDisposed } from './lineSet'
import { PointMarkers } from './PointMarkers'
import { polylineSegmentPositions } from './seamSegments'
import { useCanvasPointer } from './useCanvasPointer'

const PREVIEW_WIDTH_PX = 3

// While the draw tool is armed: picks points on the part, and shows the line so far running on to the cursor. The line
// is only a preview; where it snaps to the part's edges is decided in the worker when drawing finishes.
export function DrawTool({ partRef }: { partRef: RefObject<Mesh | null> }) {
  const tool = useStore((s) => s.tool)
  const camera = useThree((state) => state.camera)
  const active = tool.tool === 'draw'
  const [cursor, setCursor] = useState<Vec3 | null>(null)
  const raycaster = useMemo(() => {
    const r = new Raycaster()
    r.firstHitOnly = true
    return r
  }, [])
  const pointer = useMemo(() => new Vector2(), [])

  const hitPart = (x: number, y: number, rect: DOMRect): Vec3 | null => {
    const part = partRef.current
    if (!part) return null
    pointer.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObject(part, false)[0]
    return hit ? [hit.point.x, hit.point.y, hit.point.z] : null
  }

  useCanvasPointer(active, {
    move: (x, y, rect) => setCursor(hitPart(x, y, rect)),
    leave: () => setCursor(null),
    click: (x, y, rect, detail) => {
      // The second click of a double click only exists to finish the line.
      if (detail > 1) return
      const p = hitPart(x, y, rect)
      // The viewport's triangle order is not the model's, so the click does not name a triangle; -1 means unknown.
      if (p) void toolEvent({ type: 'click', target: { kind: 'surface', point: { p, face: -1 } } }, getGeometryClient())
    },
    doubleClick: () => void toolEvent({ type: 'finish' }, getGeometryClient()),
  })

  const placed = useMemo(() => (tool.tool === 'draw' ? tool.points.map((point) => point.p) : []), [tool])
  const shownCursor = active ? cursor : null
  const preview = useMemo(() => {
    const path = shownCursor ? [...placed, shownCursor] : placed
    return path.length >= 2 ? lineSet(polylineSegmentPositions(path), { width: PREVIEW_WIDTH_PX, color: cssVar('--brand-secondary'), renderOrder: 4 }) : null
  }, [placed, shownCursor])
  useDisposed(preview)

  const cursorMarker = useMemo(() => (shownCursor ? [shownCursor] : []), [shownCursor])
  if (!active) return null
  return (
    <>
      {preview && <primitive object={preview} />}
      <PointMarkers positions={placed} shape="dot" color={cssVar('--brand-secondary')} size={9} />
      <PointMarkers positions={cursorMarker} shape="ring" color={cssVar('--seam-hover')} size={18} />
    </>
  )
}
