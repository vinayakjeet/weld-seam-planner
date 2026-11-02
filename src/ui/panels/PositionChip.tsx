import type { SeamPosition } from '../../core/torch/positions'
import { Tooltip } from '../kit/Tooltip'
import { positionLines } from './seamRows'

// Easy positions read green, vertical blue, overhead amber, so the hard seams stand out in a long list.
const TONE: Record<string, string> = {
  PA: 'border-ok/40 bg-ok/10 text-ok',
  PB: 'border-ok/40 bg-ok/10 text-ok',
  PF: 'border-info/40 bg-info/10 text-info',
  PG: 'border-info/40 bg-info/10 text-info',
  PD: 'border-warn/40 bg-warn/10 text-warn',
}

export function PositionChip({ position }: { position: SeamPosition | null }) {
  if (!position) {
    return (
      <span aria-label="Position not worked out yet" className="text-ink-2">
        -
      </span>
    )
  }
  const tone = TONE[position.code.replace(/\+$/, '')] ?? 'border-line text-ink-1'
  return (
    <Tooltip
      content={
        <div className="num flex flex-col gap-0.5">
          {positionLines(position).map((line, i) => (
            <span key={line} className={i === 0 ? 'text-ink-0' : 'text-ink-1'}>
              {line}
            </span>
          ))}
        </div>
      }
    >
      <span
        data-testid="position-chip"
        className={`num inline-block rounded-sm border px-1 text-[10px] font-semibold leading-4 ${tone}`}
      >
        {position.code}
      </span>
    </Tooltip>
  )
}
