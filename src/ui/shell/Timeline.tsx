import { useMemo, useState } from 'react'
import { timelineSegments } from '../../core/sequence/timeline'
import { selectPlan } from '../../state/selectors'
import { useStore } from '../../state/store'
import { NO_ACCEPTED_TEXT } from '../panels/NoAcceptedSeams'
import { PlaybackControls } from './PlaybackControls'
import { formatCycle } from './summary'

// A line over the bars at the playback time.
function Playhead({ total }: { total: number }) {
  const timeS = useStore((s) => s.timeS)
  if (!(total > 0)) return null
  const share = Math.min(Math.max(timeS / total, 0), 1)
  return <div aria-hidden data-testid="playhead" className="pointer-events-none absolute inset-y-0 w-px bg-ink-0" style={{ left: `calc(12px + (100% - 24px) * ${share})` }} />
}

const seconds = (t: number) => `${t.toFixed(1)} s`

// The sequence in time, for steps 4 and 5: for each seam the air move to it (muted) and its arc (accent), widths in
// proportion to the seconds they take. Hovering a block names the seam and the time. Collapses to its header.
export function Timeline() {
  const step = useStore((s) => s.activeStep)
  const timing = useStore((s) => s.timing)
  const current = useStore((s) => s.timingFor === selectPlan(s))
  const seams = useStore((s) => selectPlan(s).seams)
  const [open, setOpen] = useState(true)

  const segments = useMemo(() => (timing ? timelineSegments(timing) : []), [timing])
  const labels = useMemo(() => new Map(seams.map((p) => [p.seam.id, p.seam.label])), [seams])
  if (step !== 'sequence' && step !== 'export') return null

  const total = segments.length > 0 ? segments[segments.length - 1]!.t1 : 0
  const arc = timing?.arcTimeS ?? 0
  const air = timing?.airTimeS ?? 0
  const name = (kind: 'air' | 'arc', seamId: string) =>
    kind === 'arc' ? `Arc on ${labels.get(seamId) ?? seamId}` : seamId === 'home' ? 'Air move home' : `Air move to ${labels.get(seamId) ?? seamId}`

  return (
    <section aria-label="Timeline" className={`shrink-0 border-t border-line bg-surface-1 ${open ? 'h-[120px]' : 'h-8'}`}>
      <header className="flex h-8 items-center gap-4 px-3 text-[11px]">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-ink-0 outline-none focus-visible:ring-1 focus-visible:ring-brand"
        >
          <span aria-hidden className="inline-block w-2 text-ink-2">
            {open ? 'v' : '>'}
          </span>
          Timeline
        </button>
        <span className="flex items-center gap-1.5 text-ink-2">
          <span aria-hidden className="size-2 rounded-sm bg-brand" />
          Arc <span className="num text-ink-1">{formatCycle(arc)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-ink-2">
          <span aria-hidden className="size-2 rounded-sm bg-ink-2/50" />
          Air <span className="num text-ink-1">{formatCycle(air)}</span>
        </span>
        {!current && segments.length > 0 && <span className="text-ink-2">Updating</span>}
        <span className="ml-auto">
          <PlaybackControls />
        </span>
      </header>
      {open &&
        (segments.length === 0 ? (
          <p className="px-3 pt-2 text-ink-2">{NO_ACCEPTED_TEXT}</p>
        ) : (
          <div className="relative">
          <div role="img" aria-label="Arc time and air time of each seam in sequence order" className={`flex h-[80px] items-end gap-px px-3 pb-2 ${current ? '' : 'opacity-60'}`}>
            {segments.map((segment, i) => {
              const span = segment.t1 - segment.t0
              return (
                <div
                  key={`${segment.kind}-${segment.seamId}-${i}`}
                  data-kind={segment.kind}
                  title={`${name(segment.kind, segment.seamId)}: ${seconds(span)}`}
                  style={{ flex: `${Math.max(span, total * 0.001)} 1 0` }}
                  className={`min-w-px rounded-t-sm ${segment.kind === 'arc' ? 'h-full bg-brand' : 'h-2/5 bg-ink-2/50'}`}
                />
              )
            })}
          </div>
          <Playhead total={total} />
          </div>
        ))}
    </section>
  )
}
