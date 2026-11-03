import { Html } from '@react-three/drei'
import { useMemo } from 'react'
import { selectSequenceOrder } from '../../state/selectors'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { sequenceRows } from '../panels/sequenceRows'

// A number at the middle of every accepted seam: its place in the sequence. Only in the Sequence step.
export function SequenceLabels() {
  const active = useStore((s) => s.activeStep === 'sequence')
  const order = useStore(selectSequenceOrder)
  const selectedId = useStore((s) => s.selectedId)
  const seams = useVisibleSeams()
  const labels = useMemo(() => {
    const byId = new Map(seams.map((s) => [s.id, s]))
    return sequenceRows(order, byId).map((row) => {
      const seam = byId.get(row.id)!
      return { id: row.id, n: row.n, at: seam.points[seam.points.length >> 1]?.p ?? null }
    })
  }, [order, seams])
  if (!active) return null
  return (
    <group name="sequence-labels">
      {labels.map(({ id, n, at }) =>
        at === null ? null : (
          <Html key={id} position={at} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
            <span
              className={`num grid min-w-5 place-items-center rounded-full border px-1 text-[10px] font-semibold leading-4 ${
                id === selectedId ? 'border-brand bg-brand text-white' : 'border-line bg-surface-1/90 text-ink-0'
              }`}
            >
              {n}
            </span>
          </Html>
        ),
      )}
    </group>
  )
}
