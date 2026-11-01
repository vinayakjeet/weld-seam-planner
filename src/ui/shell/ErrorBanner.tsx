import { useStore } from '../../state/store'
import { Button } from '../kit/Button'

export function ErrorBanner() {
  const importState = useStore((s) => s.importState)
  const dismiss = useStore((s) => s.dismissImport)
  if (importState.phase !== 'error') return null
  const { what, why, next } = importState.error
  return (
    <div role="alert" className="pointer-events-auto flex w-full max-w-[560px] items-start gap-3 border border-err/60 bg-surface-1 px-3 py-2.5 shadow-lg">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-err">{what}</p>
        <p className="mt-0.5 text-ink-1">{why}</p>
        <p className="mt-0.5 text-ink-0">{next}</p>
      </div>
      <Button onClick={dismiss}>Dismiss</Button>
    </div>
  )
}
