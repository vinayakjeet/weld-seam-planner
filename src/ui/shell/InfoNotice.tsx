import { useStore } from '../../state/store'
import { Button } from '../kit/Button'

// A confirmation, such as a plan restored or a file exported.
export function InfoNotice() {
  const info = useStore((s) => s.info)
  const setInfo = useStore((s) => s.setInfo)
  if (info === null) return null
  return (
    <div role="status" className="pointer-events-auto flex w-full max-w-[560px] items-center gap-3 border border-ok/60 bg-surface-1 px-3 py-2 shadow-lg">
      <p className="min-w-0 flex-1 text-ink-0">{info}</p>
      <Button onClick={() => setInfo(null)}>Dismiss</Button>
    </div>
  )
}
