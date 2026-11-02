import { dismissNotice } from '../../state/flows'
import { useStore } from '../../state/store'
import { Button } from '../kit/Button'

// A manual action that was refused: what happened, why, and what to do next.
export function ToolNotice() {
  const notice = useStore((s) => s.notice)
  if (!notice) return null
  return (
    <div role="alert" className="pointer-events-auto flex w-full max-w-[560px] items-start gap-3 border border-warn/60 bg-surface-1 px-3 py-2.5 shadow-lg">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-warn">{notice.what}</p>
        <p className="mt-0.5 text-ink-1">{notice.why}</p>
        <p className="mt-0.5 text-ink-0">{notice.next}</p>
      </div>
      <Button onClick={dismissNotice}>Dismiss</Button>
    </div>
  )
}
