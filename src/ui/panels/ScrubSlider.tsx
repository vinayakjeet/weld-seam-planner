import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { nudgeScrub, scrubStep } from './scrub'

// Moves the torch preview along the selected seam. With the slider focused, an arrow moves 1 mm and Shift with an arrow 10 mm.
export function ScrubSlider() {
  const selectedId = useStore((s) => s.selectedId)
  const scrubS = useStore((s) => s.scrubS)
  const setScrub = useStore((s) => s.setScrub)
  const seam = useVisibleSeams().find((s) => s.id === selectedId)
  if (!seam) return null

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor="torch-scrub" className="text-ink-1">
          Position along seam
        </label>
        <span className="num text-[11px] text-ink-1">
          {Math.min(scrubS, seam.lengthMm).toFixed(1)} / {seam.lengthMm.toFixed(1)} mm
        </span>
      </div>
      <input
        id="torch-scrub"
        type="range"
        min={0}
        max={seam.lengthMm}
        step={0.1}
        value={Math.min(scrubS, seam.lengthMm)}
        onChange={(e) => setScrub(Number(e.target.value))}
        onKeyDown={(e) => {
          const step = scrubStep(e.key, e.shiftKey)
          if (step === null || e.ctrlKey || e.metaKey || e.altKey) return
          e.preventDefault()
          setScrub(nudgeScrub(scrubS, step, seam.lengthMm, seam.closed))
        }}
        className="w-full rounded-sm accent-brand outline-none focus-visible:ring-1 focus-visible:ring-brand"
      />
    </div>
  )
}
