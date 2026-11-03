import { totalOf, SPEEDS } from '../../state/playbackSlice'
import { useStore } from '../../state/store'
import { formatCycle } from './summary'

// Play or pause, the scrub slider, the speed, and the time read-out. Space does the same as the play button.
export function PlaybackControls() {
  const playing = useStore((s) => s.playing)
  const timeS = useStore((s) => s.timeS)
  const speed = useStore((s) => s.speed)
  const total = useStore((s) => totalOf(s))
  const toggle = useStore((s) => s.toggle)
  const seek = useStore((s) => s.seek)
  const setSpeed = useStore((s) => s.setSpeed)
  const empty = total <= 0

  return (
    <div className="flex items-center gap-3" role="group" aria-label="Playback">
      <button
        type="button"
        disabled={empty}
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        title={empty ? 'Nothing to play yet: accept seams first' : playing ? 'Pause (Space)' : 'Play (Space)'}
        className="h-6 min-w-14 rounded-sm border border-line bg-surface-2 px-2 text-ink-0 outline-none hover:border-ink-2 focus-visible:ring-1 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40"
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        aria-label="Playback position"
        min={0}
        max={total}
        step={0.1}
        value={Math.min(timeS, total)}
        disabled={empty}
        onChange={(e) => seek(Number(e.target.value))}
        className="w-48 accent-brand disabled:opacity-40"
      />
      <span data-testid="playback-time" className="num min-w-24 text-ink-1">
        {formatCycle(timeS)} / {formatCycle(total)}
      </span>
      <div role="radiogroup" aria-label="Playback speed" className="flex gap-1">
        {SPEEDS.map((x) => (
          <button
            key={x}
            type="button"
            role="radio"
            aria-checked={speed === x}
            onClick={() => setSpeed(x)}
            className={`h-6 rounded-sm border px-1.5 outline-none focus-visible:ring-1 focus-visible:ring-brand ${
              speed === x ? 'border-brand bg-brand/20 text-ink-0' : 'border-line text-ink-2 hover:text-ink-0'
            }`}
          >
            {x}x
          </button>
        ))}
      </div>
    </div>
  )
}
