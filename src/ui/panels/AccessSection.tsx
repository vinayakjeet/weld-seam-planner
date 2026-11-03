import { useStore } from '../../state/store'
import { accessFor } from '../../state/accessSlice'
import { reachFor } from '../../state/reachSlice'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { AccessChip } from './AccessChip'
import { accessLine, clearanceText, intervalsText } from './accessText'
import { reachLine } from './reachText'

const EMPTY = 'Select a seam to see whether the torch can reach it.'

// What the access check found for the selected seam: how wide the free cone in front of the torch is at 300 mm and at
// 60 mm, the class that follows, and the stretches where no tool fits.
export function AccessSection() {
  const selectedId = useStore((s) => s.selectedId)
  const status = useStore((s) => (s.selectedId === null ? undefined : s.statusById[s.selectedId]))
  const accessById = useStore((s) => s.accessById)
  const accessPointsById = useStore((s) => s.accessPointsById)
  const busy = useStore((s) => s.accessBusy)
  const reachById = useStore((s) => s.reachById)
  const reachPointsById = useStore((s) => s.reachPointsById)
  const reachKeyById = useStore((s) => s.reachKeyById)
  const ports = useStore((s) => s.ports)
  const arm = useStore((s) => s.arm)
  const seam = useVisibleSeams().find((s) => s.id === selectedId)
  const access = seam ? accessFor({ accessById, accessPointsById }, seam) : null
  const reach = seam ? reachFor({ reachById, reachPointsById, reachKeyById, ports, arm }, seam) : null
  const reachText = reachLine(reach, access?.class ?? null)

  let body: React.ReactNode
  if (!seam) {
    body = <p className="text-ink-2">{EMPTY}</p>
  } else if (status !== 'accepted') {
    body = <p className="text-ink-2">Access is checked for accepted seams. Accept this seam to check it.</p>
  } else if (!access || access.class === null || access.clearanceDeg === null || access.nearClearanceDeg === null) {
    body = <p className="text-ink-2">{busy ? 'Checking torch access.' : 'Torch access has not been checked yet.'}</p>
  } else {
    body = (
      <div className="flex flex-col gap-2">
        <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt className="text-ink-2">300 mm</dt>
          <dd className="num text-ink-0">{clearanceText(access.clearanceDeg)} free cone</dd>
          <dt className="text-ink-2">60 mm</dt>
          <dd className="num text-ink-0">{clearanceText(access.nearClearanceDeg)} free cone</dd>
          <dt className="text-ink-2">Class</dt>
          <dd>
            <AccessChip cls={access.class} pending={false} />
          </dd>
        </dl>
        <p className="text-ink-1">{accessLine(access.class)}</p>
        {reachText !== '' && (
          <p className="text-ink-1">
            Reach <span className="num text-ink-0">{reachText}</span>
            {reach && reach.unreachable.length > 0 && (
              <>
                , missed at <span className="num text-ink-0">{intervalsText(reach.unreachable)}</span>
              </>
            )}
            .
          </p>
        )}
        {access.unreachable.length > 0 && (
          <p className="text-ink-1">
            No tool fits at <span className="num text-ink-0">{intervalsText(access.unreachable)}</span> along the seam.
          </p>
        )}
      </div>
    )
  }

  return (
    <section className="border-b border-line px-4 py-3">
      <h2 className="mb-1.5 text-xs font-semibold text-ink-0">Access</h2>
      {body}
    </section>
  )
}
