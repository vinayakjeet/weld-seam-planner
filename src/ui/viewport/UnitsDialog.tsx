import { useState } from 'react'
import type { Units } from '../../core/mesh/units'
import { chooseUnits } from '../../state/flows'
import { useStore } from '../../state/store'
import { getGeometryClient } from '../../worker/client'
import { Button } from '../kit/Button'
import { Dialog } from '../kit/Dialog'
import { defaultUnits, sizeInMm, UNIT_CHOICES } from './unitChoices'

function formatMm(mm: number): string {
  return `${Number(mm.toPrecision(3)).toLocaleString('en-US')} mm`
}

function UnitsForm({ maxDimension, guess, onCancel }: { maxDimension: number; guess: Units; onCancel: () => void }) {
  const [units, setUnits] = useState(defaultUnits(guess))
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void chooseUnits(units, getGeometryClient())
      }}
    >
      <fieldset className="mt-4 grid gap-2 border-0 p-0">
        <legend className="sr-only">Units of the file</legend>
        {UNIT_CHOICES.map((choice) => (
          <label
            key={choice.units}
            className="flex cursor-pointer items-center gap-3 border border-line px-3 py-2 has-[:checked]:border-brand has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-brand"
          >
            <input
              type="radio"
              name="units"
              value={choice.units}
              checked={units === choice.units}
              onChange={() => setUnits(choice.units)}
              className="accent-brand"
            />
            <span className="flex-1 text-ink-0">{choice.label}</span>
            <span className="num text-ink-2">{formatMm(sizeInMm(maxDimension, choice.units))} across</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary">
          Load part
        </Button>
      </div>
    </form>
  )
}

export function UnitsDialog() {
  const importState = useStore((s) => s.importState)
  const dismiss = useStore((s) => s.dismissImport)
  const asking = importState.phase === 'needs-units' ? importState : null
  const description = asking
    ? `${asking.fileName} is only ${Number(asking.maxDimension.toPrecision(3))} units across and STL files do not record their units. ${
        asking.guess === 'unknown' ? 'That is too small to guess from, so millimetres is preselected. ' : ''
      }Pick the unit that gives a realistic part size.`
    : ''
  return (
    <Dialog
      open={asking !== null}
      onOpenChange={(open) => {
        if (!open) dismiss()
      }}
      title="What units is this file in?"
      description={description}
    >
      {asking && <UnitsForm key={asking.fileName} maxDimension={asking.maxDimension} guess={asking.guess} onCancel={dismiss} />}
    </Dialog>
  )
}
