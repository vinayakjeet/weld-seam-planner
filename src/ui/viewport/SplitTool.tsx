import { useThree } from '@react-three/fiber'
import { useMemo, useState } from 'react'
import { Vector3 } from 'three'
import { toolEvent } from '../../state/flows'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { getGeometryClient } from '../../worker/client'
import { missedSeam } from '../panels/manualText'
import { nearestScreenIndex } from '../tools/screenPick'
import { cssVar } from './cssVar'
import { PointMarkers } from './PointMarkers'
import { useCanvasPointer } from './useCanvasPointer'

// How close, in pixels, the cursor has to be to a sample of the selected seam to pick it.
const PICK_RADIUS_PX = 16

// While the split tool is armed: marks the sample of the selected seam nearest the cursor, and cuts there on click.
export function SplitTool() {
  const armed = useStore((s) => s.tool.tool === 'split')
  const selectedId = useStore((s) => s.selectedId)
  const seams = useVisibleSeams()
  const camera = useThree((state) => state.camera)
  const [picked, setPicked] = useState<number | null>(null)
  const seam = useMemo(() => (armed ? seams.find((s) => s.id === selectedId) : undefined), [armed, seams, selectedId])
  const scratch = useMemo(() => new Vector3(), [])

  const pickAt = (x: number, y: number, rect: DOMRect): number | null => {
    if (!seam) return null
    const screen = seam.points.map(({ p }) => {
      scratch.set(p[0], p[1], p[2]).project(camera)
      // Beyond the far plane or behind the camera the projection is meaningless.
      return scratch.z > 1 ? { x: Number.NaN, y: Number.NaN } : { x: (scratch.x * 0.5 + 0.5) * rect.width, y: (-scratch.y * 0.5 + 0.5) * rect.height }
    })
    return nearestScreenIndex(screen, { x, y }, PICK_RADIUS_PX)
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
  return <PointMarkers positions={marker} shape="ring" color={cssVar('--warn')} size={22} />
}
