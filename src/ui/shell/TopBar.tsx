import { Tooltip } from '../kit/Tooltip'
import { Stepper } from './Stepper'

export function TopBar() {
  return (
    <header className="flex h-12 items-center gap-6 border-b border-line bg-surface-1 px-3">
      <div className="flex w-[276px] shrink-0 items-center gap-2">
        <span aria-hidden className="grid size-6 place-items-center rounded-sm border border-line">
          <span className="h-0.5 w-3.5 rounded-full bg-brand" />
        </span>
        <span className="font-display text-sm font-semibold">Weld Seam Planner</span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="text-ink-2">No part loaded</span>
        <span className="num rounded-sm border border-line px-1.5 text-[11px] text-ink-2">units: none</span>
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        <Stepper />
      </div>

      <Tooltip content="Export unlocks after a part is loaded and its seams pass pre-flight.">
        <span tabIndex={0} className="rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-brand">
          <button
            type="button"
            disabled
            className="h-8 cursor-not-allowed rounded-sm bg-brand px-4 font-medium text-white opacity-40"
          >
            Export
          </button>
        </span>
      </Tooltip>
    </header>
  )
}
