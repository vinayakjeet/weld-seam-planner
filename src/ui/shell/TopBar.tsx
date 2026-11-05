import { useStore } from '../../state/store'
import { ExportControl } from './ExportControl'
import { Stepper } from './Stepper'
import { partChip } from './summary'

export function TopBar() {
  const part = useStore((s) => s.part)
  const chip = partChip(part)
  const setActiveStep = useStore((s) => s.setActiveStep)
  const setHelpOpen = useStore((s) => s.setHelpOpen)
  return (
    <header className="flex h-12 items-center gap-3 border-b border-line bg-surface-1 px-3">
      <div className="flex shrink-0 items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}brand/armatrix-horizontal-light-sand.svg`} alt="Armatrix" className="h-5 w-auto shrink-0" />
        <span className="font-display text-base leading-none whitespace-nowrap">Weld Seam Planner</span>
      </div>

      <div className="flex min-w-0 max-w-[140px] shrink items-center gap-2">
        {part ? (
          // The Import step holds the file chooser and the samples, and warns before accepted seams are discarded.
          <button
            type="button"
            aria-label={`Open another part, current part ${chip.name}`}
            title="Open another part"
            onClick={() => setActiveStep('import')}
            className="min-w-0 truncate rounded-sm text-ink-0 underline decoration-line underline-offset-4 outline-none hover:decoration-ink-1 focus-visible:ring-1 focus-visible:ring-brand"
          >
            {chip.name}
          </button>
        ) : (
          <span className="truncate text-ink-2">{chip.name}</span>
        )}
        <span className="num shrink-0 rounded-sm border border-line px-1.5 text-[11px] text-ink-2">{chip.units}</span>
      </div>

      <div className="@container flex min-w-0 flex-1 justify-center">
        <Stepper />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ExportControl />
        <button
          type="button"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={() => setHelpOpen(true)}
          className="num grid size-8 place-items-center rounded-sm border border-line text-ink-1 outline-none hover:border-ink-2 hover:text-ink-0 focus-visible:ring-1 focus-visible:ring-brand"
        >
          ?
        </button>
      </div>
    </header>
  )
}
