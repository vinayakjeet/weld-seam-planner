import { useMemo } from 'react'
import { rotate } from '../../core/math/quat'
import { poseAt } from '../../core/torch/frames'
import { positionFor, posesFor } from '../../state/torchSlice'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { previewCtwdMm } from '../../state/flows'
import { useTorchScale } from '../viewport/TorchMesh'
import { GravitySelect } from './GravitySelect'
import { PositionChip } from './PositionChip'
import { ScrubSlider } from './ScrubSlider'
import { torchNote } from './torchNote'

const fixed = (values: readonly number[], digits: number) => values.map((v) => v.toFixed(digits)).join(', ')

function Readout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-2">{label}</dt>
      <dd className="num min-w-0 text-ink-0">{children}</dd>
    </>
  )
}

function PoseReadout() {
  const selectedId = useStore((s) => s.selectedId)
  const scrubS = useStore((s) => s.scrubS)
  const poseEntry = useStore((s) => s.posesForSelected)
  const positionsById = useStore((s) => s.positionsById)
  const gravity = useStore((s) => s.gravity)
  const order = useStore((s) => s.order)
  const seam = useVisibleSeams().find((s) => s.id === selectedId)

  const poses = seam ? posesFor({ posesForSelected: poseEntry }, seam) : null
  const pose = useMemo(() => (seam && poses && poses.length > 0 ? poseAt(poses, scrubS, seam.closed) : null), [seam, poses, scrubS])
  if (!seam) return null
  if (!pose) return <p className="text-ink-2">Working out the torch poses.</p>

  const position = positionFor({ positionsById, gravity, order }, seam) ?? null
  return (
    <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1">
      <Readout label="Point">{fixed(pose.p, 1)} mm</Readout>
      <Readout label="Tool axis">{fixed(rotate(pose.q, [0, 0, 1]), 3)}</Readout>
      <Readout label="Position">
        <span className="flex items-center gap-2">
          <PositionChip position={position} />
          {position && (
            <span className="text-ink-1">
              {position.inclinationDeg.toFixed(1)}&deg; slope, {position.rotationDeg.toFixed(0)}&deg; rotation
            </span>
          )}
        </span>
      </Readout>
    </dl>
  )
}

function DrawingNote() {
  const selectedId = useStore((s) => s.selectedId)
  const seam = useVisibleSeams().find((s) => s.id === selectedId)
  const ctwdMm = useStore((s) => (seam ? previewCtwdMm(s, seam) : null))
  const scale = useTorchScale()
  return <p className="text-[11px] text-ink-2">{torchNote(scale, ctwdMm)}</p>
}

export function TorchSection() {
  const selectedId = useStore((s) => s.selectedId)
  const hasSelection = useVisibleSeams().some((s) => s.id === selectedId)
  return (
    <section className="border-b border-line px-4 py-3">
      <h2 className="mb-2 text-xs font-semibold text-ink-0">Torch</h2>
      <GravitySelect />
      {hasSelection ? (
        <div className="flex flex-col gap-3">
          <ScrubSlider />
          <PoseReadout />
          <DrawingNote />
        </div>
      ) : (
        <p className="text-ink-2">Select a seam to preview the torch along it.</p>
      )}
    </section>
  )
}
