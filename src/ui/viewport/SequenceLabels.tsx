import { Html } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Mesh, Object3D } from 'three'
import type { Vec3 } from '../../core/math/vec3'
import { selectSequenceOrder } from '../../state/selectors'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { sequenceRows } from '../panels/sequenceRows'
import { toLocal } from '../../core/mesh/displayOrigin'
import { labelAnchor, labelLift } from './labelAnchor'
import { useOrigin } from './origin'

interface LabelProps {
  id: string
  n: number
  at: Vec3
  selected: boolean
  occluder: RefObject<Object3D>[] | undefined
  onHidden: (id: string, hidden: boolean) => void
}

function Label({ id, n, at, selected, occluder, onHidden }: LabelProps) {
  const [hidden, setHidden] = useState(false)
  return (
    <Html
      position={at}
      center
      occlude={occluder}
      onOcclude={(isHidden) => {
        setHidden(isHidden)
        onHidden(id, isHidden)
      }}
      zIndexRange={[5, 0]}
      style={{ pointerEvents: 'none' }}
    >
      {!hidden && (
        <span
          className={`num grid min-w-5 place-items-center rounded-full border px-1 text-[10px] font-semibold leading-4 ${
            selected ? 'border-brand bg-brand-fill text-on-primary' : 'border-line bg-surface-1/90 text-ink-0'
          }`}
        >
          {n}
        </span>
      )}
    </Html>
  )
}

// A number by the middle of every accepted seam: its place in the sequence. Only in the Sequence step. Like the seam
// lines, a label is hidden while the part stands between it and the camera, unless x-ray is on; the view toolbar says
// how many are hidden.
export function SequenceLabels({ partRef }: { partRef: RefObject<Mesh | null> }) {
  const active = useStore((s) => s.activeStep === 'sequence')
  const order = useStore(selectSequenceOrder)
  const selectedId = useStore((s) => s.selectedId)
  const xray = useStore((s) => s.xray)
  // The part mesh is drawn, and its ref set, whenever there is display geometry.
  const partDrawn = useStore((s) => s.display !== null)
  const bbox = useStore((s) => s.part?.bbox ?? null)
  const setHiddenLabels = useStore((s) => s.setHiddenLabels)
  const seams = useVisibleSeams()
  const labels = useMemo(() => {
    const byId = new Map(seams.map((s) => [s.id, s]))
    const lift = bbox ? labelLift(bbox) : 0
    return sequenceRows(order, byId).map((row) => {
      const seam = byId.get(row.id)!
      const middle = seam.points[seam.points.length >> 1]
      return { id: row.id, n: row.n, at: middle ? labelAnchor(middle, lift) : null }
    })
  }, [order, seams, bbox])
  const origin = useOrigin()
  const occluding = active && !xray && partDrawn
  const occluder = occluding ? [partRef as RefObject<Object3D>] : undefined

  // Each label reports when the part starts or stops hiding it; the count is of the hidden ones that still have a label.
  // Turning occlusion on or off draws every label again, so the count starts again.
  const hidden = useRef(new Set<string>())
  const ids = labels.map((l) => l.id).join('|')
  const count = () => {
    const current = new Set(ids.split('|'))
    setHiddenLabels([...hidden.current].filter((id) => current.has(id)).length)
  }
  useEffect(() => {
    hidden.current.clear()
    setHiddenLabels(0)
    return () => setHiddenLabels(0)
  }, [occluding, setHiddenLabels])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(count, [ids])
  const onHidden = (id: string, isHidden: boolean) => {
    if (isHidden) hidden.current.add(id)
    else hidden.current.delete(id)
    count()
  }

  if (!active) return null
  return (
    <group name="sequence-labels">
      {labels.map(({ id, n, at }) =>
        at === null ? null : (
          // The key changes with occlusion on or off: drei tests a label for being hidden only when it moves on screen.
          <Label
            key={`${id}-${occluding}`}
            id={id}
            n={n}
            at={toLocal(at, origin)}
            selected={id === selectedId}
            occluder={occluder}
            onHidden={onHidden}
          />
        ),
      )}
    </group>
  )
}
