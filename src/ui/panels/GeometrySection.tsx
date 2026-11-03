import type { Explained } from '../../core/job/plan'
import type { JointType } from '../../core/seams/classify'
import { useStore } from '../../state/store'
import { useSelectedSeams } from '../../state/useVisibleSeams'
import { NumberField } from '../kit/NumberField'
import { parseNumberInput } from './overrideFields'
import { JOINT_TYPES, jointLabel } from './seamRows'

const oneDecimal = (value: number) => String(Number(value.toFixed(1)))

function Heading() {
  return <h2 className="text-xs font-semibold text-ink-0">Geometry</h2>
}

export function GeometrySection() {
  const seams = useSelectedSeams()
  const typeById = useStore((s) => s.typeById)
  const thicknessById = useStore((s) => s.thicknessById)
  const setType = useStore((s) => s.setType)
  const setThickness = useStore((s) => s.setThickness)

  if (seams.length === 0) {
    return (
      <section className="border-b border-line px-4 py-3">
        <h2 className="mb-1.5 text-xs font-semibold text-ink-0">Geometry</h2>
        <p className="text-ink-2">Select a seam to see its length, joint type and plate thickness.</p>
      </section>
    )
  }

  if (seams.length > 1) {
    const total = seams.reduce((sum, s) => sum + s.lengthMm, 0)
    return (
      <section className="flex flex-col gap-1.5 border-b border-line px-4 py-3">
        <Heading />
        <p className="text-ink-0">
          {seams.length} seams, <span className="num">{oneDecimal(total)}</span> mm in total.
        </p>
        <p className="text-ink-2">Select one seam to change its joint type or plate thickness.</p>
      </section>
    )
  }

  const seam = seams[0]!
  const jointType = typeById[seam.id] ?? seam.jointType
  const edited = thicknessById[seam.id]
  const shown = edited ?? seam.thicknessMm

  const commitSide = (side: 0 | 1, text: string): Explained | null => {
    const parsed = parseNumberInput({ label: `Plate ${side + 1} thickness`, unit: 'mm', min: 'positive' }, text)
    if (parsed.kind === 'error') return parsed.error
    const next: [number | null, number | null] = [shown[0], shown[1]]
    next[side] = parsed.kind === 'set' ? parsed.value : seam.thicknessMm[side]
    return setThickness(seam.id, next[0] === seam.thicknessMm[0] && next[1] === seam.thicknessMm[1] ? null : next)
  }

  return (
    <section className="flex flex-col gap-2 border-b border-line px-4 py-3">
      <Heading />
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
        <dt className="text-ink-1">Length</dt>
        <dd className="num text-ink-0">{oneDecimal(seam.lengthMm)} mm</dd>
        <dt className="text-ink-1">Opening angle</dt>
        <dd className="num text-ink-0">{oneDecimal(seam.openingAngleDeg)}&deg;</dd>
      </dl>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
        <label htmlFor="seam-joint-type" className="text-ink-1">
          Joint type
        </label>
        <select
          id="seam-joint-type"
          value={jointType}
          onChange={(e) => {
            setType(seam.id, e.target.value as JointType)
            e.target.blur()
          }}
          className="h-6 rounded-sm border border-line bg-surface-2 px-1.5 text-ink-0 outline-none focus-visible:border-brand"
        >
          {JOINT_TYPES.map((type) => (
            <option key={type} value={type}>
              {jointLabel(type)}
              {type === seam.jointType ? ' (detected)' : ''}
            </option>
          ))}
        </select>
      </div>
      {([0, 1] as const).map((side) => (
        <NumberField
          key={side}
          label={`Plate ${side + 1} thickness`}
          unit="mm"
          value={shown[side] === null ? '' : String(shown[side])}
          placeholder="Unknown"
          changed={edited !== undefined && edited[side] !== seam.thicknessMm[side]}
          onReset={() => commitSide(side, '')}
          onCommit={(text) => commitSide(side, text)}
          hint={
            shown[side] === null ? (
              <p className="text-[11px] text-ink-2">Could not be measured. Enter it so the leg limits can be checked.</p>
            ) : undefined
          }
        />
      ))}
    </section>
  )
}
