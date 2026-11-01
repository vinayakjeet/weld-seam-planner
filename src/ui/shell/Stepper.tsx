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
              {i > 0 && <span aria-hidden className="h-px w-4 bg-line" />}
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => setActiveStep(step.id)}
                className={`flex h-8 items-center gap-2 rounded-sm px-2.5 whitespace-nowrap outline-none focus-visible:ring-1 focus-visible:ring-brand ${
                  active ? 'bg-brand/15 text-ink-0' : 'text-ink-1 hover:bg-surface-2 hover:text-ink-0'
                }`}
              >
                <span
                  className={`num grid size-5 place-items-center rounded-full text-[11px] ${
                    active ? 'bg-brand text-white' : 'border border-line text-ink-2'
                  }`}
                >
                  {i + 1}
                </span>
                {step.label}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
