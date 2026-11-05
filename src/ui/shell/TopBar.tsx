import { useStore } from '../../state/store'
import { chooseTheme, nextTheme, themeLabel, type Theme } from './theme'
import { ExportControl } from './ExportControl'
import { Stepper } from './Stepper'
import { partChip } from './summary'

export function TopBar() {
  const part = useStore((s) => s.part)
  const chip = partChip(part)
  const setActiveStep = useStore((s) => s.setActiveStep)
  const setHelpOpen = useStore((s) => s.setHelpOpen)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  return (
    <header className="flex h-12 items-center gap-3 border-b border-line bg-surface-1 px-3">
      <div className="flex shrink-0 items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}brand/armatrix-horizontal-${theme === 'dark' ? 'light-sand' : 'dark-forest'}.svg`} alt="Armatrix" className="h-5 w-auto shrink-0" />
        <span className="font-display text-base leading-none whitespace-nowrap">Weld Seam Planner</span>
      </div>

      <div className="flex min-w-0 max-w-[120px] shrink items-center gap-2">
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
          aria-label={themeLabel(theme)}
          title={themeLabel(theme)}
          onClick={() => chooseTheme(nextTheme(theme), setTheme)}
          className="grid size-8 place-items-center rounded-sm border border-line text-ink-1 outline-none hover:border-ink-2 hover:text-ink-0 focus-visible:ring-1 focus-visible:ring-brand"
        >
          <ThemeIcon theme={theme} />
        </button>
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

// The sun while the dark theme is on (the click turns the light on), the moon while the light theme is on.
function ThemeIcon({ theme }: { theme: Theme }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      {theme === 'dark' ? (
        <>
          <circle cx="8" cy="8" r="2.8" />
          <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
        </>
      ) : (
        <path d="M13 9.6A5.4 5.4 0 0 1 6.4 3 5.4 5.4 0 1 0 13 9.6Z" />
      )}
    </svg>
  )
}
