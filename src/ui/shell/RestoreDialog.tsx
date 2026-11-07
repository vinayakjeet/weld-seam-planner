import { restoreSaved, startFresh } from '../../state/autosave'
import { offerSummary } from '../../state/savedPlan'
import { useStore } from '../../state/store'
import { getGeometryClient } from '../../worker/client'
import { Button } from '../kit/Button'
import { Dialog } from '../kit/Dialog'
import { savedOnText } from './restoreText'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// Offered when a part loads that has a plan saved from an earlier session.
export function RestoreDialog() {
  const offer = useStore((s) => s.offer)
  const summary = offer ? offerSummary(offer) : null
  const when = offer ? savedOnText(offer.savedAt) : ''
  return (
    <Dialog
      open={offer !== null}
      onOpenChange={(open) => {
        if (!open) startFresh()
      }}
      title="Restore your saved plan?"
      description={
        offer && summary
          ? `${offer.partName} has a plan saved on ${when}: ${plural(summary.acceptedSeams, 'accepted seam')}, ${plural(summary.proceduresInUse, 'procedure')} in use. Start fresh keeps the saved plan until you make your next change.`
          : ''
      }
    >
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={startFresh}>Start fresh</Button>
        <Button variant="primary" onClick={() => void restoreSaved(getGeometryClient())}>
          Restore
        </Button>
      </div>
    </Dialog>
  )
}
