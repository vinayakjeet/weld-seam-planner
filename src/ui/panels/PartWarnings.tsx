import { useMemo } from 'react'
import { selectPartWarnings } from '../../state/selectors'
import { useStore } from '../../state/store'
import { Tooltip } from '../kit/Tooltip'
import { warningChips } from './partWarnings'

const TONE = { warn: 'border-warn text-warn', info: 'border-info text-info' } as const

export function PartWarnings() {
  const part = useStore((s) => s.part)
  const chips = useMemo(() => warningChips(selectPartWarnings({ part })), [part])
  if (chips.length === 0) return null
  return (
    <div role="list" aria-label="Part warnings" className="flex shrink-0 flex-wrap gap-1.5 border-b border-line px-3 py-2">
      {chips.map((chip) => (
        <Tooltip
          key={chip.code}
          content={
            <div className="space-y-1">
              {chip.detail.split('\n').map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          }
        >
          <span role="listitem" tabIndex={0} className={`rounded-full border px-2 py-0.5 text-[11px] ${TONE[chip.severity]}`}>
            {chip.label}
          </span>
        </Tooltip>
      ))}
    </div>
  )
}
