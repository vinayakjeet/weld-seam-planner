import { useStore } from '../../state/store'
import { ExportControl } from './ExportControl'
import { Stepper } from './Stepper'
import { partChip } from './summary'

export function TopBar() {
  const part = useStore((s) => s.part)
  const chip = partChip(part)
  return (
    <header className="flex h-12 items-center gap-6 border-b border-line bg-surface-1 px-3">
      <div className="flex w-[276px] shrink-0 items-center gap-2">
        <span aria-hidden className="grid size-6 place-items-center rounded-sm border border-line">
          <span className="h-0.5 w-3.5 rounded-full bg-brand" />
        </span>
        <span className="font-display text-sm font-semibold">Weld Seam Planner</span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className={part ? 'text-ink-0' : 'text-ink-2'}>{chip.name}</span>
        <span className="num rounded-sm border border-line px-1.5 text-[11px] text-ink-2">{chip.units}</span>
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        <Stepper />
      </div>

      <ExportControl />
    </header>
  )
}
