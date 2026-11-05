import { useThree } from '@react-three/fiber'
import { useMemo, useRef, useState, type RefObject } from 'react'
import { OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, type Camera, type Mesh } from 'three'
import type { Vec3 } from '../../core/math/vec3'
import { toolEvent } from '../../state/flows'
import { useStore } from '../../state/store'
import { getGeometryClient } from '../../worker/client'
import { cssVar } from './cssVar'
import { lineSet, useDisposed } from './lineSet'
import { PointMarkers } from './PointMarkers'
import { polylineSegmentPositions } from './seamSegments'
import { mmPerPixel, SNAP_RADIUS_PX } from './screenScale'
import { useCanvasPointer } from './useCanvasPointer'
import { useOrigin } from './origin'

const PREVIEW_WIDTH_PX = 3

// The snap radius in mm at a point: SNAP_RADIUS_PX pixels on screen, so zooming in tightens it and zooming out widens it.
function snapRadiusAt(camera: Camera, point: Vec3, viewportHeightPx: number): number {
  if (camera instanceof OrthographicCamera) {
    return SNAP_RADIUS_PX * mmPerPixel({ kind: 'ortho', heightMm: camera.top - camera.bottom, zoom: camera.zoom }, 0, viewportHeightPx)
  }
  const fovDeg = camera instanceof PerspectiveCamera ? camera.fov : 40
  const distance = Math.hypot(camera.position.x - point[0], camera.position.y - point[1], camera.position.z - point[2])
  return SNAP_RADIUS_PX * mmPerPixel({ kind: 'perspective', fovDeg }, distance, viewportHeightPx)
}

// While the draw tool is armed: picks points on the part, and shows the line so far running on to the cursor. The line
// is only a preview; where it snaps to the part's edges is decided in the worker when drawing finishes.
export function DrawTool({ partRef }: { partRef: RefObject<Mesh | null> }) {
  const origin = useOrigin()
  const tool = useStore((s) => s.tool)
  const camera = useThree((state) => state.camera)
  const active = tool.tool === 'draw'
  const [cursor, setCursor] = useState<Vec3 | null>(null)
  // Where the first click would land, asked of the worker with one request at a time; the newest cursor wins.
  const [snapped, setSnapped] = useState<Vec3 | null>(null)
  const asking = useRef(false)
  const wanted = useRef<{ p: Vec3; radiusMm: number } | null>(null)
  const left = useRef(0)
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

  const askSnap = (p: Vec3, radiusMm: number) => {
    wanted.current = { p, radiusMm }
    if (asking.current) return
    asking.current = true
    void (async () => {
      while (wanted.current) {
        const question = wanted.current
        const leaves = left.current
        wanted.current = null
        const answer = await getGeometryClient().snapPreview(question.p, question.radiusMm)
        // An answer for a cursor position that has been left behind, or for a pointer that has since left, is dropped.
        if (!wanted.current && leaves === left.current) setSnapped(answer)
      }
      asking.current = false
    })()
  }

  useCanvasPointer(active, {
    move: (x, y, rect) => {
      const p = hitPart(x, y, rect)
      setCursor(p)
      if (p) askSnap(p, snapRadiusAt(camera, p, rect.height))
      else setSnapped(null)
    },
    leave: () => {
      wanted.current = null
      left.current++
      setCursor(null)
      setSnapped(null)
    },
    click: (x, y, rect, detail) => {
      // The second click of a double click only exists to finish the line.
      if (detail > 1) return
      const p = hitPart(x, y, rect)
      if (p) void toolEvent({ type: 'click', target: { kind: 'surface', point: { p, snapRadiusMm: snapRadiusAt(camera, p, rect.height) } } }, getGeometryClient())
    },
    doubleClick: () => void toolEvent({ type: 'finish' }, getGeometryClient()),
  })

  const placed = useMemo(() => (tool.tool === 'draw' ? tool.points.map((point) => point.p) : []), [tool])
  // Every click is placed by the worker's snap, so the marker shows where the next one will land.
  const shownCursor = active ? (snapped ?? cursor) : null
  const preview = useMemo(() => {
    const path = shownCursor ? [...placed, shownCursor] : placed
    return path.length >= 2 ? lineSet(polylineSegmentPositions(path), { origin, width: PREVIEW_WIDTH_PX, color: cssVar('--brand-secondary'), renderOrder: 4 }) : null
  }, [origin, placed, shownCursor])
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
