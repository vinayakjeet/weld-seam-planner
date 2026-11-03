import { useShallow } from 'zustand/react/shallow'
import { selectPlan, selectStats } from '../../state/selectors'
import { useStore } from '../../state/store'
import { toolHint } from '../panels/manualText'
import { cycleField, statusFields } from './summary'

function Stat({ label, value, stale = false }: { label: string; value: string; stale?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5" title={stale ? 'Updating for the latest changes' : undefined}>
      <span className="text-ink-2">{label}</span>
      <span className={stale ? 'num text-ink-2' : 'num text-ink-1'}>{value}</span>
    </span>
  )
}

export function StatusBar() {
  const stats = useStore(useShallow(selectStats))
  const partLoaded = useStore((s) => s.part !== null)
  const { fields, note } = statusFields(stats, partLoaded)
  const cycle = useStore(useShallow((s) => cycleField(s.timing, s.timingFor === selectPlan(s))))
  const hint = toolHint(useStore((s) => s.tool))
  return (
    <footer className="flex h-6 items-center gap-5 border-t border-line bg-surface-1 px-3 text-[11px]">
      {fields.map((field) => (
        <Stat key={field.label} {...field} />
      ))}
      <Stat label="Cycle time" value={cycle.value} stale={cycle.stale} />
      {hint ? (
        <span className="ml-auto flex min-w-0 items-center gap-2 text-ink-0" data-testid="tool-hint">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand" />
          <span className="truncate">{hint}</span>
        </span>
      ) : (
        <span className="ml-auto text-ink-2">{note}</span>
      )}
    </footer>
  )
}
