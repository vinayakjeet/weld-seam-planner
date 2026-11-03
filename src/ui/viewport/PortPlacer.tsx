import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState, type RefObject } from 'react'
import { Raycaster, Vector2, type Mesh } from 'three'
import type { Vec3 } from '../../core/math/vec3'
import { useStore } from '../../state/store'
import { cssVar } from './cssVar'
import { PointMarkers } from './PointMarkers'
import { useCanvasPointer } from './useCanvasPointer'

// Rounded to 4 decimals and made unit length again, so a face that is square to an axis gives exactly that axis.
function tidy(v: Vec3): Vec3 {
  const rounded = v.map((n) => Math.round(n * 1e4) / 1e4 + 0) as Vec3
  const length = Math.hypot(...rounded)
  return length === 0 ? v : (rounded.map((n) => n / length + 0) as Vec3)
}

interface Hit {
  point: Vec3
  // Points into the part: minus the face normal as seen from the camera.
  direction: Vec3
}

// While a port is being placed, a click on the part adds a port at the hit point pointing into the surface.
export function PortPlacer({ partRef }: { partRef: RefObject<Mesh | null> }) {
  const placing = useStore((s) => s.placingPort)
  const camera = useThree((state) => state.camera)
  const [cursor, setCursor] = useState<Vec3 | null>(null)
  const raycaster = useMemo(() => {
    const r = new Raycaster()
    r.firstHitOnly = true
    return r
  }, [])
  const pointer = useMemo(() => new Vector2(), [])

  const hitPart = (x: number, y: number, rect: DOMRect): Hit | null => {
    const part = partRef.current
    if (!part) return null
    pointer.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObject(part, false)[0]
    if (!hit?.face) return null
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
    // The part is drawn double sided: a face seen from behind still gets a normal that faces the camera.
    if (normal.dot(raycaster.ray.direction) > 0) normal.negate()
    return { point: [hit.point.x, hit.point.y, hit.point.z].map((n) => Math.round(n * 100) / 100 + 0) as Vec3, direction: tidy([-normal.x, -normal.y, -normal.z]) }
  }

  useCanvasPointer(placing, {
    move: (x, y, rect) => setCursor(hitPart(x, y, rect)?.point ?? null),
    leave: () => setCursor(null),
    click: (x, y, rect, detail) => {
      if (detail > 1) return
      const hit = hitPart(x, y, rect)
      if (hit) useStore.getState().addPort(hit.point, hit.direction)
    },
  })

  useEffect(() => {
    if (!placing) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useStore.getState().setPlacingPort(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placing])

  const markers = useMemo(() => (placing && cursor ? [cursor] : []), [placing, cursor])
  if (!placing) return null
  return <PointMarkers positions={markers} shape="ring" color={cssVar('--seam-hover')} size={18} />
}
