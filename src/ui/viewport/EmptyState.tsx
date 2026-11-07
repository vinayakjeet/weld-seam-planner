import { createElement, useRef, useState, type DragEvent } from 'react'
import { importFile, importSample } from '../../state/flows'
import { STEPS, useStore } from '../../state/store'
import { getGeometryClient } from '../../worker/client'
import { Button } from '../kit/Button'
import { firstRunHint } from '../shell/firstRunHint'
import { iconForSample } from './SampleIcons'
import { useSampleManifest } from './useSampleManifest'

export function EmptyState() {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const loading = useStore((s) => s.importState.phase === 'loading')
  const acceptedCount = useStore((s) => Object.values(s.statusById).filter((status) => status === 'accepted').length)
  const manifest = useSampleManifest()

  // Only the first file counts, and nothing new starts while a load is running.
  const load = (file: File | undefined) => {
    if (file && !loading) void importFile(file, getGeometryClient())
  }

  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }

  const onDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    load(e.dataTransfer.files[0])
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      // Auto margins centre the box while it fits and let it scroll from its top when it does not.
      className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4"
    >
      <section
        aria-label="Import a part"
        aria-busy={loading}
        className={`m-auto w-full max-w-[720px] border border-dashed px-6 py-6 backdrop-blur-sm ${
          dragging ? 'border-brand bg-brand/10' : 'border-part-edge bg-viewport/80'
        }`}
      >
        <h1 className="font-display text-2xl font-semibold text-ink-0">Drop an STL file or pick a sample</h1>
        <p className="mt-1.5 text-ink-1">Files are read in your browser and never uploaded.</p>
        <p className="mt-1 text-ink-2">{firstRunHint(STEPS)}</p>

        {acceptedCount > 0 && (
          <p className="mt-4 border border-warn/50 bg-warn/10 px-3 py-2 text-warn">
            Loading a new file replaces this part and discards {acceptedCount} accepted {acceptedCount === 1 ? 'seam' : 'seams'}.
          </p>
        )}

        <div className="mt-5">
          <input
            ref={inputRef}
            type="file"
            accept=".stl,model/stl,application/sla"
            tabIndex={-1}
            aria-hidden
            className="hidden"
            onChange={(e) => {
              load(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <Button variant="primary" disabled={loading} onClick={() => inputRef.current?.click()}>
            Choose file
          </Button>
        </div>

        {manifest.status === 'loading' && <p className="mt-6 text-ink-2">Loading samples</p>}
        {manifest.status === 'error' && (
          <div role="status" className="mt-6 text-warn">
            <p className="font-semibold">{manifest.error.what}</p>
            <p>{manifest.error.why}</p>
            <p>{manifest.error.next}</p>
          </div>
        )}
        {manifest.status === 'ok' && (
          <ul className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-2">
            {manifest.manifest.samples.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  disabled={loading}
                  title={entry.description}
                  onClick={() => void importSample(entry, getGeometryClient(), fetch)}
                  className="flex h-full w-full flex-col items-center gap-2 border border-line bg-surface-1 px-2 pb-2.5 pt-3 text-ink-1 outline-none hover:border-ink-2 hover:text-ink-0 focus-visible:ring-1 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:text-ink-1"
                >
                  {createElement(iconForSample(entry.id))}
                  <span>{entry.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
