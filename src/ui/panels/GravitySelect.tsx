import { useState } from 'react'
import { changeGravity } from '../../state/flows'
import { GRAVITY_PRESETS, gravityText, presetFor } from '../../state/torchSlice'
import { useStore } from '../../state/store'
import { Button } from '../kit/Button'

const CUSTOM = 'custom'
const AXES = ['x', 'y', 'z'] as const

// Which way the part sits in the world. Welding positions follow it: tilt the part and a flat seam becomes a vertical one.
export function GravitySelect() {
  const gravity = useStore((s) => s.gravity)
  const [draft, setDraft] = useState<string[] | null>(null)
  const preset = presetFor(gravity)
  const showCustom = draft !== null || preset === null
  const fields = draft ?? gravity.map(String)

  const choose = (value: string) => {
    if (value === CUSTOM) {
      setDraft(gravity.map(String))
      return
    }
    const found = GRAVITY_PRESETS.find((p) => p.label === value)
    if (found && changeGravity(found.gravity) === null) setDraft(null)
  }

  const apply = (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (changeGravity([Number(fields[0]), Number(fields[1]), Number(fields[2])]) === null) setDraft(null)
  }

  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="gravity-select" className="text-ink-1">
          Gravity
        </label>
        <select
          id="gravity-select"
          value={showCustom ? CUSTOM : preset.label}
          onChange={(e) => choose(e.target.value)}
          className="h-7 min-w-0 flex-1 rounded-sm border border-line bg-surface-0 px-2 text-ink-0 outline-none focus:border-brand"
        >
          {GRAVITY_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
          <option value={CUSTOM}>Custom vector</option>
        </select>
      </div>
      {showCustom && (
        <form onSubmit={apply} aria-label="Custom gravity vector" className="flex items-center gap-1.5">
          {AXES.map((axis, i) => (
            <label key={axis} className="flex items-center gap-1 text-[11px] uppercase text-ink-2">
              {axis}
              <input
                type="number"
                step="any"
                aria-label={`Gravity ${axis}`}
                value={fields[i]}
                onChange={(e) => setDraft(fields.map((f, k) => (k === i ? e.target.value : f)))}
                className="num h-7 w-[52px] rounded-sm border border-line bg-surface-0 px-1.5 text-right text-ink-0 outline-none focus:border-brand"
              />
            </label>
          ))}
          <Button type="submit" className="ml-auto h-7 px-2.5">
            Apply
          </Button>
        </form>
      )}
      <p className="text-[11px] text-ink-2">
        Welding positions are worked out with <span className="text-ink-1">{gravityText(gravity)}</span>.
      </p>
    </div>
  )
}
