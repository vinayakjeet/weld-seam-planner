import { useThree } from '@react-three/fiber'
import { useMemo, useState, type RefObject } from 'react'
import { Raycaster, Vector3, type Mesh } from 'three'
import { toolEvent } from '../../state/flows'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { getGeometryClient } from '../../worker/client'
import { missedSeam } from '../panels/manualText'
import { nearestVisibleScreenIndex } from '../tools/screenPick'
import { cssVar } from './cssVar'
import { isCovered } from './pickSeam'
import { PointMarkers } from './PointMarkers'
import { useCanvasPointer } from './useCanvasPointer'

// How close, in pixels, the cursor has to be to a sample of the selected seam to pick it.
const PICK_RADIUS_PX = 16

// While the split tool is armed: marks the sample of the selected seam nearest the cursor, and cuts there on click.
// A sample on the far side of the part, or inside it, is skipped unless x-ray shows the part see-through.
export function SplitTool({ partRef }: { partRef: RefObject<Mesh | null> }) {
  const armed = useStore((s) => s.tool.tool === 'split')
  const selectedId = useStore((s) => s.selectedId)
  const seams = useVisibleSeams()
  const camera = useThree((state) => state.camera)
  const [picked, setPicked] = useState<number | null>(null)
  const seam = useMemo(() => (armed ? seams.find((s) => s.id === selectedId) : undefined), [armed, seams, selectedId])
  const xray = useStore((s) => s.xray)
  const scratch = useMemo(() => new Vector3(), [])
  const eye = useMemo(() => new Vector3(), [])
  const toward = useMemo(() => new Vector3(), [])
  const toPart = useMemo(() => {
    const ray = new Raycaster()
    ray.firstHitOnly = true
    return ray
  }, [])

  const visibleFromCamera = (index: number): boolean => {
    const part = xray ? null : partRef.current
    const sample = seam?.points[index]
    if (!part || !sample) return true
    scratch.set(sample.p[0], sample.p[1], sample.p[2])
    camera.getWorldPosition(eye)
    toPart.set(eye, toward.copy(scratch).sub(eye).normalize())
    return !isCovered(eye.distanceTo(scratch), toPart.intersectObject(part, false)[0]?.distance ?? null)
  }

  const pickAt = (x: number, y: number, rect: DOMRect): number | null => {
    if (!seam) return null
    const screen = seam.points.map(({ p }) => {
      scratch.set(p[0], p[1], p[2]).project(camera)
      // Beyond the far plane or behind the camera the projection is meaningless.
      return scratch.z > 1 ? { x: Number.NaN, y: Number.NaN } : { x: (scratch.x * 0.5 + 0.5) * rect.width, y: (-scratch.y * 0.5 + 0.5) * rect.height }
    })
    return nearestVisibleScreenIndex(screen, { x, y }, PICK_RADIUS_PX, visibleFromCamera)
  }

  useCanvasPointer(seam !== undefined, {
    move: (x, y, rect) => setPicked(pickAt(x, y, rect)),
    leave: () => setPicked(null),
    click: (x, y, rect) => {
      const index = pickAt(x, y, rect)
      const sample = index === null ? undefined : seam?.points[index]
      if (!seam || !sample) useStore.getState().setNotice(missedSeam())
      else void toolEvent({ type: 'click', target: { kind: 'seam', id: seam.id, s: sample.s } }, getGeometryClient())
    },
  })

  const marker = useMemo(() => {
    const sample = seam && picked !== null ? seam.points[picked] : undefined
    return sample ? [sample.p] : []
  }, [seam, picked])
  return <PointMarkers positions={marker} shape="ring" color={cssVar('--scene-warn')} size={22} />
}
