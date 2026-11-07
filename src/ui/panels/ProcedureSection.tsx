import { useMemo } from 'react'
import { resolveSeam } from '../../core/job/plan'
import { HEAT_INPUT_LIMITS } from '../../core/process/heatInput'
import { proceduresForPosition } from '../../core/process/wps'
import { plannedSeam, selectPlan } from '../../state/selectors'
import { useStore } from '../../state/store'
import { positionFor } from '../../state/torchSlice'
import { useSelectedSeams } from '../../state/useVisibleSeams'
import { NumberField } from '../kit/NumberField'
import { defaultLegText, heatInputReadout, legHints, travelReadout, type Level, type Readout } from './calcText'
import { missingProcedureIds, procedureOptionLabel } from './procedureChoice'
import { OVERRIDE_FIELDS, disabledReason, isOverridden, parseNumberInput, parseOverrideInput, patchFor, sharedValue, valueOf } from './overrideFields'

const LEVEL_TEXT: Record<Level, string> = { ok: 'text-ink-0', amber: 'text-warn', red: 'text-err' }
const LEVEL_BAR: Record<Level, string> = { ok: 'border-line', amber: 'border-warn', red: 'border-err' }

const GAUGE_MAX = 4
const pct = (kJmm: number) => `${(kJmm / GAUGE_MAX) * 100}%`
const tint = (token: string, share: number) => `color-mix(in srgb, var(${token}) ${share}%, transparent)`

// The heat input against the band the pre-flight check allows: the marker is the value, the colours are the limits.
function HeatGauge({ kJmm }: { kJmm: number }) {
  const { lowBelowKJmm, amberAboveKJmm, redAboveKJmm } = HEAT_INPUT_LIMITS
  const stops = [
    `${tint('--line', 100)} 0 ${pct(lowBelowKJmm)}`,
    `${tint('--ok', 45)} ${pct(lowBelowKJmm)} ${pct(amberAboveKJmm)}`,
    `${tint('--warn', 55)} ${pct(amberAboveKJmm)} ${pct(redAboveKJmm)}`,
    `${tint('--err', 55)} ${pct(redAboveKJmm)} 100%`,
  ]
  return (
    <div aria-hidden className="relative mt-1 h-1.5 w-full" style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }}>
      <span className="absolute -top-0.5 h-2.5 w-0.5 bg-ink-0" style={{ left: `calc(${pct(Math.min(kJmm, GAUGE_MAX))} - 1px)` }} />
    </div>
  )
}

function ReadoutRow({ label, readout, gauge, stack }: { label: string; readout: Readout; gauge?: boolean; stack?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 border-l-2 pl-2 ${LEVEL_BAR[readout.level]}`}>
      <div className={stack ? 'flex flex-col' : 'flex items-baseline justify-between gap-2'}>
        <span className="text-ink-1">{label}</span>
        <span className={`num ${stack ? '' : 'text-right'} ${LEVEL_TEXT[readout.level]}`}>{readout.text}</span>
      </div>
      {gauge && readout.kJmm !== null && <HeatGauge kJmm={readout.kJmm} />}
      {gauge && (
        <p className="text-[11px] text-ink-2">
          Usual band {HEAT_INPUT_LIMITS.lowBelowKJmm} to {HEAT_INPUT_LIMITS.amberAboveKJmm} kJ/mm
        </p>
      )}
      {readout.reasons.map((reason) => (
        <p key={reason} className={`text-[11px] ${LEVEL_TEXT[readout.level]}`}>
          {reason}
        </p>
      ))}
    </div>
  )
}

const MIXED_OPTION = '__mixed__'

const HINT_TEXT = { info: 'text-ink-2', amber: 'text-warn', red: 'text-err' } as const

export function ProcedureSection() {
  const seams = useSelectedSeams()
  const plan = useStore(selectPlan)
  const typeById = useStore((s) => s.typeById)
  const thicknessById = useStore((s) => s.thicknessById)
  const procedureById = useStore((s) => s.procedureById)
  const overridesById = useStore((s) => s.overridesById)
  const legById = useStore((s) => s.legById)
  const positionsById = useStore((s) => s.positionsById)
  const gravity = useStore((s) => s.gravity)
  const order = useStore((s) => s.order)
  const primaryId = useStore((s) => s.selectedId)
  const assignProcedure = useStore((s) => s.assignProcedure)
  const setOverride = useStore((s) => s.setOverride)
  const setLeg = useStore((s) => s.setLeg)

  const planned = useMemo(
    () => seams.map((seam) => plannedSeam({ typeById, thicknessById, procedureById, overridesById, legById }, seam)),
    [seams, typeById, thicknessById, procedureById, overridesById, legById],
  )
  const resolved = useMemo(() => planned.map((p) => resolveSeam(plan, p)), [plan, planned])

  if (seams.length === 0) {
    return (
      <section className="border-b border-line px-4 py-3">
        <h2 className="mb-1.5 text-xs font-semibold text-ink-0">Procedure</h2>
        <p className="text-ink-2">Select a seam to choose a welding procedure and override its values. Ctrl or Shift click selects several.</p>
      </section>
    )
  }

  const ids = seams.map((s) => s.id)
  const assigned = ids.map((id) => procedureById[id] ?? '')
  const mixedProcedure = new Set(assigned).size > 1
  const missing = missingProcedureIds(assigned, plan.procedures)
  const primary = seams.find((s) => s.id === primaryId) ?? seams[0]!
  const iso = positionFor({ positionsById, gravity, order }, primary)?.code.replace(/\+$/, '') ?? null
  const ordered = proceduresForPosition(plan.procedures, iso)
  const allHaveProcedure = resolved.every((r) => r.procedure !== null)
  const heat = allHaveProcedure ? heatInputReadout(resolved) : null
  const travel = allHaveProcedure ? travelReadout(resolved) : null

  const setLegs = legSet(ids.map((id) => legById[id] ?? null))

  return (
    <section key={ids.join('|')} className="flex flex-col gap-3 border-b border-line px-4 py-3">
      <h2 className="text-xs font-semibold text-ink-0">{seams.length === 1 ? 'Procedure' : `Procedure for ${seams.length} seams`}</h2>

      <div className="flex flex-col gap-0.5">
        <label htmlFor="seam-procedure" className="text-ink-1">
          Welding procedure
        </label>
        <select
          id="seam-procedure"
          value={mixedProcedure ? MIXED_OPTION : assigned[0]}
          onChange={(e) => {
            assignProcedure(ids, e.target.value === '' ? null : e.target.value)
            e.target.blur()
          }}
          className="h-7 rounded-sm border border-line bg-surface-2 px-1.5 text-ink-0 outline-none focus-visible:border-brand"
        >
          {mixedProcedure && (
            <option value={MIXED_OPTION} disabled>
              Mixed
            </option>
          )}
          {!mixedProcedure &&
            missing.map((id) => (
              <option key={id} value={id} disabled>
                {id} (not in the library)
              </option>
            ))}
          <option value="">Not set</option>
          {ordered.map((p) => (
            <option key={p.id} value={p.id}>
              {procedureOptionLabel(p, iso, !mixedProcedure && assigned[0] === p.id)}
            </option>
          ))}
        </select>
      </div>

      {allHaveProcedure ? (
        <div className="flex flex-col gap-2">
          {OVERRIDE_FIELDS.map((field) => {
            const shared = sharedValue(resolved.map((r) => valueOf(r.procedure!, field)))
            const mixed = shared === 'mixed'
            const blocked = disabledReason(field, resolved.map((r) => r.procedure!))
            return (
              <NumberField
                key={field.key}
                label={field.label}
                unit={field.unit}
                value={mixed || shared === null ? '' : String(Number(shared.toFixed(3)))}
                placeholder={blocked !== null ? 'No gas' : mixed ? 'Mixed' : shared === null ? 'None' : ''}
                disabled={blocked !== null}
                hint={blocked === null ? undefined : <p className="text-[11px] text-ink-2">{blocked}</p>}
                changed={planned.some((p) => isOverridden(p.overrides, field))}
                onReset={() => setOverride(ids, patchFor(field, undefined))}
                onCommit={(text) => {
                  const parsed = parseOverrideInput(field, text)
                  if (parsed.kind === 'error') return parsed.error
                  return setOverride(ids, patchFor(field, parsed.kind === 'set' ? parsed.value : undefined))
                }}
              />
            )
          })}
        </div>
      ) : (
        <p className="text-ink-2">Choose a procedure for {seams.length === 1 ? 'this seam' : 'every selected seam'} to change its values and see heat input.</p>
      )}

      <NumberField
        label="Leg"
        unit="mm"
        wide
        value={setLegs.kind === 'same' ? String(setLegs.value) : ''}
        placeholder={setLegs.kind === 'mixed' ? 'Mixed' : defaultLegText(resolved)}
        changed={setLegs.kind !== 'none'}
        onReset={() => setLeg(ids, null)}
        onCommit={(text) => {
          const parsed = parseNumberInput({ label: 'Leg', unit: 'mm', min: 'positive' }, text)
          if (parsed.kind === 'error') return parsed.error
          return setLeg(ids, parsed.kind === 'set' ? parsed.value : null)
        }}
        hint={legHints(resolved).map((hint) => (
          <p key={hint.text} className={`text-[11px] ${HINT_TEXT[hint.level]}`}>
            {hint.text}
          </p>
        ))}
      />

      <div className="flex flex-col gap-2" aria-live="polite">
        {heat ? (
          <ReadoutRow label="Heat input" readout={heat} gauge />
        ) : (
          <p className="text-ink-2">Heat input and travel speed appear once every selected seam has a procedure.</p>
        )}
        {travel && <ReadoutRow label="Suggested travel speed" readout={travel} stack />}
      </div>
    </section>
  )
}

type LegSet = { kind: 'none' } | { kind: 'mixed' } | { kind: 'same'; value: number }

function legSet(legs: Array<number | null>): LegSet {
  const set = legs.filter((l): l is number => l !== null)
  if (set.length === 0) return { kind: 'none' }
  return set.length === legs.length && set.every((l) => l === set[0]) ? { kind: 'same', value: set[0]! } : { kind: 'mixed' }
}
