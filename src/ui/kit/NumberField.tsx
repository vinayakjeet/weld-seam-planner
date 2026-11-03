import { useId, useState, type ReactNode } from 'react'
import type { Explained } from '../../core/job/plan'

interface NumberFieldProps {
  label: string
  unit?: string
  // What the field shows when it is not being edited.
  value: string
  placeholder?: string
  disabled?: boolean
  // A value the user set over the default: the field is marked and offers a reset.
  changed?: boolean
  onReset?: () => void
  // Returns what was wrong with the text, or null when it was taken. A refused text stays in the box.
  onCommit: (text: string) => Explained | null
  hint?: ReactNode
  // Puts the box under the label at full width, for a placeholder that is a sentence rather than a number.
  wide?: boolean
}

export function NumberField({ label, unit, value, placeholder, disabled, changed, onReset, onCommit, hint, wide }: NumberFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const [problem, setProblem] = useState<Explained | null>(null)

  const commit = () => {
    if (draft === null) return
    const result = onCommit(draft)
    setProblem(result)
    if (result === null) setDraft(null)
  }

  return (
    <div className={`flex flex-col gap-0.5 border-l-2 pl-2 ${changed ? 'border-brand' : 'border-transparent'}`}>
      <div className={`grid items-center gap-x-2 ${wide ? 'grid-cols-1 gap-y-0.5' : 'grid-cols-[minmax(0,1fr)_96px]'}`}>
        <label htmlFor={id} className={changed ? 'text-ink-0' : 'text-ink-1'}>
          {label}
        </label>
        <span className="flex items-center gap-1">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            value={draft ?? value}
            placeholder={placeholder}
            aria-invalid={problem !== null}
            aria-describedby={problem ? `${id}-problem` : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              // Leaving the box commits it, and frees Ctrl+Z, which a focused text box keeps for itself.
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setDraft(null)
                setProblem(null)
              }
            }}
            className="num h-6 min-w-0 flex-1 rounded-sm border border-line bg-surface-2 px-1.5 text-right text-ink-0 outline-none placeholder:text-ink-2 focus-visible:border-brand disabled:opacity-40 aria-[invalid=true]:border-err"
          />
          {unit && <span className="w-9 shrink-0 text-[11px] text-ink-2">{unit}</span>}
        </span>
      </div>
      {changed && onReset && (
        <button
          type="button"
          onClick={() => {
            setDraft(null)
            setProblem(null)
            onReset()
          }}
          className="self-end rounded-sm text-[11px] text-ink-2 outline-none hover:text-ink-0 focus-visible:ring-1 focus-visible:ring-brand"
        >
          Reset {label.toLowerCase()}
        </button>
      )}
      {problem && (
        <p id={`${id}-problem`} role="alert" className="text-[11px] text-err" title={problem.why}>
          {problem.what} {problem.next}
        </p>
      )}
      {hint}
    </div>
  )
}
