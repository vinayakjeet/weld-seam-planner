import type { AccessClass } from '../../core/access/clearance'
import { Tooltip } from '../kit/Tooltip'
import { accessChipText, accessLabel, accessLine } from './accessText'

export const ACCESS_TONE: Record<AccessClass, string> = {
  standard: 'border-access-standard/40 bg-access-standard/10 text-access-standard',
  slim: 'border-access-slim/40 bg-access-slim/10 text-access-slim',
  snake: 'border-access-snake/40 bg-access-snake/10 text-access-snake',
  blocked: 'border-access-blocked/40 bg-access-blocked/10 text-access-blocked',
}

// The class of a seam as a chip, a neutral dash when it has none, and a neutral dot while the check runs.
export function AccessChip({ cls, pending, title }: { cls: AccessClass | null; pending: boolean; title?: string }) {
  if (cls === null) {
    return pending ? (
      <span aria-label="Checking torch access" title="Checking torch access" className="text-ink-2">
        ...
      </span>
    ) : (
      <span aria-label="Access not checked" className="text-ink-2">
        -
      </span>
    )
  }
  return (
    <Tooltip
      content={
        <div className="flex flex-col gap-0.5">
          <span className="text-ink-0">{title ? title : accessLabel(cls)}</span>
          <span className="text-ink-1">{accessLine(cls)}</span>
        </div>
      }
    >
      <span
        data-testid="access-chip"
        data-access={cls}
        aria-label={`Access ${accessLabel(cls)}`}
        className={`num inline-block rounded-sm border px-1 text-[10px] font-semibold leading-4 ${ACCESS_TONE[cls]}`}
      >
        {accessChipText(cls)}
      </span>
    </Tooltip>
  )
}
