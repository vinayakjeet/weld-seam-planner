import { useShallow } from 'zustand/react/shallow'
import { selectStats } from '../../state/selectors'
import { useStore } from '../../state/store'
import { toolHint } from '../panels/manualText'
import { statusFields } from './summary'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-ink-2">{label}</span>
      <span className="num text-ink-1">{value}</span>
    </span>
  )
}

export function StatusBar() {
  const stats = useStore(useShallow(selectStats))
  const partLoaded = useStore((s) => s.part !== null)
  const { fields, note } = statusFields(stats, partLoaded)
  const hint = toolHint(useStore((s) => s.tool))
  return (
    <footer className="flex h-6 items-center gap-5 border-t border-line bg-surface-1 px-3 text-[11px]">
      {fields.map((field) => (
        <Stat key={field.label} {...field} />
      ))}
      <Stat label="Cycle time" value="0:00" />
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
