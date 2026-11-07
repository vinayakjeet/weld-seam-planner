import type { StepId } from '../../state/store'
import { useStore } from '../../state/store'
import { Button } from '../kit/Button'

export const NO_ACCEPTED_TEXT = 'No accepted seams. Accept seams in step 2 first.'
export const NO_PART_TEXT = 'No part loaded. Pick a sample or drop an STL file in step 1 first.'

const NEEDS_ACCEPTED: readonly StepId[] = ['procedures', 'sequence', 'export']

export function showsNoAccepted(step: StepId, acceptedCount: number): boolean {
  return acceptedCount === 0 && NEEDS_ACCEPTED.includes(step)
}

// What the steps that need accepted seams are missing first: a part, then accepted seams, and the step that gives it.
export function firstNeed(partLoaded: boolean): { text: string; step: StepId; action: string } {
  return partLoaded ? { text: NO_ACCEPTED_TEXT, step: 'seams', action: 'Go to Seams' } : { text: NO_PART_TEXT, step: 'import', action: 'Go to Import' }
}

export function NoAcceptedSeams() {
  const setActiveStep = useStore((s) => s.setActiveStep)
  const need = firstNeed(useStore((s) => s.part !== null))
  return (
    <div className="flex shrink-0 flex-col items-start gap-2 border-b border-line px-3 py-3 text-ink-2">
      <p>{need.text}</p>
      <Button onClick={() => setActiveStep(need.step)}>{need.action}</Button>
    </div>
  )
}
