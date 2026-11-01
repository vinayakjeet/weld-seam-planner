import { scheduleDetect } from '../../state/flows'
import { selectStats } from '../../state/selectors'
import { useStore } from '../../state/store'
import { getGeometryClient } from '../../worker/client'
import { hiddenAcceptedMessage } from './seamText'

export const CREASE_ANGLE_RANGE = { min: 15, max: 60 } as const

export function DetectionSettings() {
  const partLoaded = useStore((s) => s.part !== null)
  const settings = useStore((s) => s.detectSettings)
  const busy = useStore((s) => s.detectBusy)
  const hidden = hiddenAcceptedMessage(useStore((s) => selectStats(s).hiddenAccepted))

  if (!partLoaded) {
    return <p className="p-3 text-ink-2">Detection settings and the body list appear here once a part is loaded.</p>
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
      <p role="status" className="min-h-4 text-ink-1">
        {busy ? 'Detecting seams.' : ''}
      </p>
      {hidden && <p className="border border-warn/50 bg-warn/10 px-3 py-2 text-warn">{hidden}</p>}
    </div>
  )
}
