import type { StepId } from '../../state/store'
import { useStore } from '../../state/store'
import { Button } from '../kit/Button'

export const NO_ACCEPTED_TEXT = 'No accepted seams. Accept seams in step 2 first.'

const NEEDS_ACCEPTED: readonly StepId[] = ['procedures', 'sequence', 'export']

export function showsNoAccepted(step: StepId, acceptedCount: number): boolean {
  return acceptedCount === 0 && NEEDS_ACCEPTED.includes(step)
}

export function NoAcceptedSeams() {
  const setActiveStep = useStore((s) => s.setActiveStep)
  return (
    <div className="flex shrink-0 flex-col items-start gap-2 border-b border-line px-3 py-3 text-ink-2">
      <p>{NO_ACCEPTED_TEXT}</p>
      <Button onClick={() => setActiveStep('seams')}>Go to Seams</Button>
    </div>
  )
}
