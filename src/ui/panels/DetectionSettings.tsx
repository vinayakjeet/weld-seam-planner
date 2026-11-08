import { useState } from 'react'
import { HOLLOW_SPAN_MM } from '../../core/seams/hollow'
import { runReweld, scheduleDetect, showError } from '../../state/flows'
import { selectStats } from '../../state/selectors'
import { useStore } from '../../state/store'
import { getGeometryClient } from '../../worker/client'
import { hiddenAcceptedMessage } from './seamText'
import { contactToleranceText, parseWeldMm, weldMmText, weldRangeText } from './weldFields'

export const CREASE_ANGLE_RANGE = { min: 15, max: 60 } as const

export function DetectionSettings() {
  const partLoaded = useStore((s) => s.part !== null)
  const settings = useStore((s) => s.detectSettings)
  const busy = useStore((s) => s.detectBusy)
  const hidden = hiddenAcceptedMessage(useStore((s) => selectStats(s).hiddenAccepted))
  const showCorners = useStore((s) => s.showCorners)
  const setShowCorners = useStore((s) => s.setShowCorners)
  const cornerCount = useStore((s) => s.seams.reduce((n, seam) => n + (seam.hidden === 'corner' ? 1 : 0), 0))
  const showHollow = useStore((s) => s.showHollow)
  const setShowHollow = useStore((s) => s.setShowHollow)
  const hollowCount = useStore((s) => s.seams.reduce((n, seam) => n + (seam.hidden === 'hollow' ? 1 : 0), 0))
  const weldTolerance = useStore((s) => s.weldTolerance)
  const bbox = useStore((s) => s.part?.bbox ?? null)
  const loading = useStore((s) => s.importState.phase === 'loading')
  const [draft, setDraft] = useState<string | null>(null)

  if (!partLoaded) {
    return <p className="p-3 text-ink-2">Detection settings and the body list appear here once a part is loaded.</p>
  }

  const diagonalMm = bbox ? Math.hypot(bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2]) : 0
  const shown = weldMmText(weldTolerance, diagonalMm)

  // Enter or leaving the box applies the text; a value that cannot be used is explained and the box goes back.
  const applyWeld = () => {
    if (draft === null) return
    const text = draft
    setDraft(null)
    if (text.trim() === shown) return
    const parsed = parseWeldMm(text, diagonalMm)
    if ('error' in parsed) {
      showError(parsed.error)
      return
    }
    void runReweld(parsed.weldTolerance, getGeometryClient())
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <label htmlFor="crease-angle" className="flex items-baseline justify-between">
        <span className="text-ink-0">Crease angle</span>
        <span className="num text-ink-1">{settings.creaseAngleDeg} degrees</span>
      </label>
      <input
        id="crease-angle"
        type="range"
        min={CREASE_ANGLE_RANGE.min}
        max={CREASE_ANGLE_RANGE.max}
        step={1}
        value={settings.creaseAngleDeg}
        onChange={(e) => scheduleDetect({ ...settings, creaseAngleDeg: Number(e.target.value) }, getGeometryClient())}
        className="w-full accent-brand"
      />
      <p className="text-ink-2">
        An edge counts as a seam candidate when the two faces bend at least this far from flat. Lower finds shallower folds, higher keeps only sharp corners.
      </p>
      <p className="text-ink-2">{contactToleranceText(diagonalMm)}</p>
      <div className="flex items-start gap-2 border-t border-line pt-3">
        <input
          id="show-corners"
          type="checkbox"
          role="switch"
          checked={showCorners}
          onChange={(e) => setShowCorners(e.target.checked)}
          className="mt-0.5 accent-brand"
        />
        <label htmlFor="show-corners" className="flex flex-col gap-0.5">
          <span className="text-ink-0">Show corner candidates</span>
          <span className="text-ink-2">
            Outside edges where two plates meet, offered for corner joints. {cornerCount === 1 ? '1 found' : `${cornerCount} found`}; hidden by default because most are not welded.
          </span>
        </label>
      </div>
      <div className="flex items-start gap-2">
        <input
          id="show-hollow"
          type="checkbox"
          role="switch"
          checked={showHollow}
          onChange={(e) => setShowHollow(e.target.checked)}
          className="mt-0.5 accent-brand"
        />
        <label htmlFor="show-hollow" className="flex flex-col gap-0.5">
          <span className="text-ink-0">Show seams inside hollow sections</span>
          <span className="text-ink-2">
            Inside corners of tubes and closed boxes, and the inside edges of tube ends, under {HOLLOW_SPAN_MM} mm across. {hollowCount === 1 ? '1 found' : `${hollowCount} found`}; hidden because no torch fits inside, and never taken by Accept all.
          </span>
        </label>
      </div>
      <details className="border-t border-line pt-3">
        <summary className="cursor-pointer text-ink-0">Advanced</summary>
        <div className="mt-2 flex flex-col gap-1">
          <label htmlFor="weld-tolerance" className="flex items-baseline justify-between gap-2">
            <span className="text-ink-0">Weld tolerance</span>
            <span className="flex items-baseline gap-1">
              <input
                id="weld-tolerance"
                type="text"
                inputMode="decimal"
                value={draft ?? shown}
                disabled={loading || diagonalMm === 0}
                aria-describedby="weld-tolerance-hint"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={applyWeld}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyWeld()
                  if (e.key === 'Escape') setDraft(null)
                }}
                className="num h-7 w-20 rounded-sm border border-line bg-surface-0 px-1.5 text-right text-ink-0 outline-none focus:border-brand disabled:opacity-50"
              />
              <span className="text-ink-2">mm</span>
            </span>
          </label>
          <p id="weld-tolerance-hint" className="text-ink-2">
            Raise it for scanned or noisy meshes. {weldRangeText(diagonalMm)}. Loads the part again and detects again.
          </p>
        </div>
      </details>
      <p role="status" className="min-h-4 text-ink-1">
        {busy ? 'Detecting seams.' : ''}
      </p>
      {hidden && <p className="border border-warn/50 bg-warn/10 px-3 py-2 text-warn">{hidden}</p>}
    </div>
  )
}
