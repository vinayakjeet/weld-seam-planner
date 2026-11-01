import { useStore } from '../../state/store'

export function ProgressBar() {
  const importState = useStore((s) => s.importState)
  if (importState.phase !== 'loading') return null
  const percent = Math.round(importState.fraction * 100)
  return (
    <div
      role="progressbar"
      aria-label="Loading part"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${importState.label}, ${percent} percent`}
      className="pointer-events-auto w-full max-w-[480px] border border-line bg-surface-1 px-3 py-2 shadow-lg"
    >
      <div className="flex items-baseline justify-between text-ink-1">
        <span>{importState.label}</span>
        <span className="num">{percent}%</span>
      </div>
      <div className="mt-1.5 h-1 bg-surface-2">
        <div className="h-full bg-brand transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
