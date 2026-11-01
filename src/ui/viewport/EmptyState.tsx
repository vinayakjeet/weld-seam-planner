import { useState, type DragEvent, type ReactNode } from 'react'
import {
  BoxBeamIcon,
  DoubleBottomCellIcon,
  LBracketIcon,
  PipeOnPlateIcon,
  TJointIcon,
} from './SampleIcons'

const SAMPLES: { id: string; name: string; icon: ReactNode }[] = [
  { id: 't-joint', name: 'T-joint', icon: <TJointIcon /> },
  { id: 'l-bracket', name: 'L-bracket', icon: <LBracketIcon /> },
  { id: 'box-beam', name: 'Box beam', icon: <BoxBeamIcon /> },
  { id: 'pipe-on-plate', name: 'Pipe on plate', icon: <PipeOnPlateIcon /> },
  { id: 'double-bottom-cell', name: 'Double-bottom cell', icon: <DoubleBottomCellIcon /> },
]

export function EmptyState() {
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      setNotice(
        `${file.name} was not loaded: STL import is not wired up yet. Nothing was uploaded, so the file is still only on your machine.`,
      )
    }
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className="absolute inset-0 grid place-items-center p-8"
    >
      <section
        aria-label="Import a part"
        className={`w-full max-w-[720px] border border-dashed px-8 py-9 backdrop-blur-sm ${
          dragging ? 'border-brand bg-brand/10' : 'border-part-edge bg-viewport/80'
        }`}
      >
        <h1 className="text-xl font-semibold text-ink-0">Drop an STL file or pick a sample</h1>
        <p className="mt-1.5 text-ink-1">Files are read in your browser and never uploaded.</p>

        <ul className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-2">
          {SAMPLES.map((sample) => (
            <li key={sample.id}>
              <button
                type="button"
                disabled
                className="flex w-full cursor-not-allowed flex-col items-center gap-2 border border-line bg-surface-1 px-2 pb-3 pt-4 text-ink-1 opacity-60"
              >
                {sample.icon}
                <span>{sample.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-ink-2">Sample parts are not generated yet, so these stay disabled.</p>

        <p role="status" className="mt-4 min-h-5 text-warn">
          {notice}
        </p>
      </section>
    </div>
  )
}
