import { useState, type FormEvent, type ReactNode } from 'react'
import { chooseTool, removeSelected, reverseSelected, trimSelected } from '../../state/flows'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { getGeometryClient } from '../../worker/client'
import { Button } from '../kit/Button'
import { Tooltip } from '../kit/Tooltip'
import type { ToolName } from '../tools/toolMachine'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

const ICONS = {
  draw: (
    <Icon>
      <path d="M2.5 12.5 6 5.5l4 3.5 3.5-5.5" />
      <circle cx={2.5} cy={12.5} r={1} fill="currentColor" />
      <circle cx={13.5} cy={3.5} r={1} fill="currentColor" />
    </Icon>
  ),
  split: (
    <Icon>
      <path d="M1.5 8h4M10.5 8h4" />
      <path d="M8 2.5v11" strokeDasharray="1.8 1.8" />
    </Icon>
  ),
  merge: (
    <Icon>
      <path d="M1.5 8h4.5M10 8h4.5" />
      <path d="m4.5 5 2.5 3-2.5 3M11.5 5 9 8l2.5 3" />
    </Icon>
  ),
  reverse: (
    <Icon>
      <path d="M2 5h11M10 2l3 3-3 3M14 11H3M6 8l-3 3 3 3" />
    </Icon>
  ),
  delete: (
    <Icon>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4" />
    </Icon>
  ),
}

interface ToolButton {
  id: 'draw' | 'split' | 'merge' | 'reverse' | 'delete'
  label: string
  key: string
  tip: string
  needsSeam: boolean
}

const BUTTONS: ToolButton[] = [
  { id: 'draw', label: 'Draw', key: 'D', tip: 'Click along a joint to draw a seam that snaps to the part edges. Enter finishes.', needsSeam: false },
  { id: 'split', label: 'Split', key: 'S', tip: 'Cut the selected seam in two where you click on it.', needsSeam: true },
  { id: 'merge', label: 'Merge', key: '', tip: 'Join the selected seam to a seam that touches one of its ends.', needsSeam: true },
  { id: 'reverse', label: 'Reverse', key: 'R', tip: 'Flip the travel direction of the selected seam.', needsSeam: true },
  { id: 'delete', label: 'Delete', key: 'Del', tip: 'Delete the selected seam. Seams found by detection can only be rejected.', needsSeam: true },
]

const FIELD =
  'h-7 w-[52px] rounded-sm border border-line bg-surface-0 px-1.5 text-right text-ink-0 outline-none placeholder:text-ink-2 focus:border-brand'

function TrimRow({ enabled, lengthMm }: { enabled: boolean; lengthMm: number | null }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    trimSelected(start, end)
    if (useStore.getState().notice === null) {
      setStart('')
      setEnd('')
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5" aria-label="Trim the selected seam">
      <span className="text-xs font-semibold text-ink-0">Trim ends</span>
      <div className="flex items-center gap-2">
        {[
          { name: 'Start', value: start, set: setStart },
          { name: 'End', value: end, set: setEnd },
        ].map((field) => (
          <label key={field.name} className="flex items-center gap-1 text-[11px] text-ink-2">
            {field.name}
            <input
              type="number"
              min={0}
              step={0.5}
              inputMode="decimal"
              placeholder="0"
              aria-label={`Trim ${field.name.toLowerCase()} in millimetres`}
              title={lengthMm === null ? undefined : `Seam length ${lengthMm.toFixed(1)} mm`}
              value={field.value}
              disabled={!enabled}
              onChange={(e) => field.set(e.target.value)}
              className={`${FIELD} num`}
            />
          </label>
        ))}
        <span className="text-[11px] text-ink-2">mm</span>
        <Button type="submit" disabled={!enabled} className="ml-auto h-7 px-2.5">
          Apply
        </Button>
      </div>
    </form>
  )
}

// Edit tools for the selected seam. Every button here does what its key does; both end up in the same undo history.
export function ManualTools() {
  const part = useStore((s) => s.part)
  const tool = useStore((s) => s.tool.tool)
  const selectedId = useStore((s) => s.selectedId)
  const seams = useVisibleSeams()
  const selected = seams.find((s) => s.id === selectedId)
  const loaded = part !== null

  const run = (id: ToolButton['id']) => {
    if (id === 'reverse') reverseSelected()
    else if (id === 'delete') removeSelected()
    else void chooseTool(id as ToolName, getGeometryClient())
  }

  return (
    <div role="group" aria-label="Seam tools" className="flex shrink-0 flex-col gap-2 border-b border-line px-3 py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-ink-0">Edit seam</span>
        {selected ? (
          <span className="num text-[11px] text-ink-1">
            <span className="text-ink-0">{selected.label}</span> {selected.lengthMm.toFixed(1)} mm
          </span>
        ) : (
          <span className="text-[11px] text-ink-2">No seam selected</span>
        )}
      </div>
      <div className="grid grid-cols-5 divide-x divide-line overflow-hidden rounded-sm border border-line bg-surface-0">
        {BUTTONS.map((b) => {
          const enabled = loaded && (!b.needsSeam || selected !== undefined)
          const pressed = b.id === tool
          return (
            <Tooltip key={b.id} content={enabled ? `${b.tip}${b.key ? ` (${b.key})` : ''}` : loaded ? 'Select a seam first.' : 'Load a part first.'}>
              <span className="flex min-w-0">
                <button
                  type="button"
                  aria-label={b.label}
                  aria-pressed={b.id === 'draw' || b.id === 'split' || b.id === 'merge' ? pressed : undefined}
                  disabled={!enabled}
                  onClick={() => run(b.id)}
                  className={`relative flex h-[46px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-35 ${
                    pressed ? 'bg-brand/20 text-ink-0 shadow-[inset_0_-2px_0_var(--brand-primary)]' : 'text-ink-1 hover:bg-surface-2 hover:text-ink-0'
                  }`}
                >
                  {b.key && <span className="num absolute right-1 top-0.5 text-[9px] text-ink-2">{b.key}</span>}
                  {ICONS[b.id]}
                  {b.label}
                </button>
              </span>
            </Tooltip>
          )
        })}
      </div>
      <TrimRow enabled={loaded && selected !== undefined} lengthMm={selected?.lengthMm ?? null} />
    </div>
  )
}
