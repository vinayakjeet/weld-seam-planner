import { STEPS, useStore } from '../../state/store'

export function Stepper() {
  const activeStep = useStore((s) => s.activeStep)
  const setActiveStep = useStore((s) => s.setActiveStep)
  const activeIndex = STEPS.findIndex((s) => s.id === activeStep)

  return (
    <nav aria-label="Workflow steps" className="min-w-0">
      <ol className="flex items-center gap-1">
        {STEPS.map((step, i) => {
          const active = i === activeIndex
          return (
            <li key={step.id} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden className="h-px w-2 bg-line" />}
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => setActiveStep(step.id)}
                className={`flex h-8 items-center gap-1.5 rounded-sm px-2 whitespace-nowrap outline-none focus-visible:ring-1 focus-visible:ring-brand ${
                  active ? 'bg-brand/15 text-ink-0' : 'text-ink-1 hover:bg-surface-2 hover:text-ink-0'
                }`}
              >
                <span
                  className={`num grid size-5 place-items-center rounded-full text-[11px] ${
                    active ? 'bg-brand-fill text-on-primary' : 'border border-line text-ink-2'
                  }`}
                >
                  {i + 1}
                </span>
                {/* Below the width that fits every name, only the open step is named; the others keep their name for screen readers. */}
                <span className={active ? undefined : 'sr-only @min-[680px]:not-sr-only'}>{step.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
