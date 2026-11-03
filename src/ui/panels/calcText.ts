import type { ResolvedSeam } from '../../core/job/plan'
import { MULTI_PASS_LEG_MM } from '../../core/process/filletRules'
import type { Check } from '../../core/process/heatInput'

export type Level = Check['level']

export interface Readout {
  text: string
  level: Level
  reasons: string[]
  // Heat input in kJ/mm, the highest of the selection; null for the travel readout.
  kJmm: number | null
}

const RANK: Record<Level, number> = { ok: 0, amber: 1, red: 2 }

function worst(checks: Check[]): { level: Level; reasons: string[] } {
  let level: Level = 'ok'
  const reasons: string[] = []
  for (const check of checks) {
    if (RANK[check.level] > RANK[level]) level = check.level
    if (check.reason !== '' && !reasons.includes(check.reason)) reasons.push(check.reason)
  }
  return { level, reasons }
}

function range(values: number[], digits: number): string {
  const lo = Math.min(...values).toFixed(digits)
  const hi = Math.max(...values).toFixed(digits)
  return lo === hi ? lo : `${lo} to ${hi}`
}

export function heatInputReadout(resolved: ResolvedSeam[]): Readout | null {
  const withProcedure = resolved.filter((r) => r.heatInputKJmm !== null)
  if (withProcedure.length === 0) return null
  const values = withProcedure.map((r) => r.heatInputKJmm!)
  return { text: `${range(values, 2)} kJ/mm`, ...worst(withProcedure.map((r) => r.heatCheck)), kJmm: Math.max(...values) }
}

export function travelReadout(resolved: ResolvedSeam[]): Readout | null {
  const withProcedure = resolved.filter((r) => r.procedure !== null)
  if (withProcedure.length === 0) return null
  const suggested = withProcedure.filter((r) => r.suggestedTravelMmS !== null)
  if (suggested.length === 0) {
    return { text: 'Not checked, this procedure has no wire feed speed', level: 'ok', reasons: [], kJmm: null }
  }
  const speeds = suggested.map((r) => r.suggestedTravelMmS!)
  const legs = suggested.map((r) => r.leg.legMm)
  const same = Math.min(...speeds).toFixed(1) === Math.max(...speeds).toFixed(1) && range(legs, 1).indexOf(' to ') < 0
  const text = same
    ? `${speeds[0]!.toFixed(1)} mm/s (${Math.round(speeds[0]! * 60)} mm/min) for a ${legs[0]!.toFixed(1)} mm leg`
    : `${range(speeds, 1)} mm/s for legs of ${range(legs, 1)} mm`
  return { text, ...worst(suggested.map((r) => r.travelCheck)), kJmm: null }
}

const SOURCE_TEXT = {
  procedure: 'from the procedure',
  minimum: 'minimum for the plate',
  fallback: 'assumed, thickness unknown',
  set: 'set by you',
} as const

export function defaultLegText(resolved: ResolvedSeam[]): string {
  if (resolved.length === 0) return ''
  const texts = new Set(resolved.map((r) => `${r.leg.legMm.toFixed(1)}, ${SOURCE_TEXT[r.leg.source]}`))
  return texts.size === 1 ? [...texts][0]! : 'Defaults differ'
}

export interface LegHint {
  level: 'info' | 'amber' | 'red'
  text: string
}

const mm = (value: number) => String(Number(value.toFixed(1)))

// The limits come from the rules in core; this only says them in words.
export function legHints(resolved: ResolvedSeam[]): LegHint[] {
  const hints: LegHint[] = []
  const known = (r: ResolvedSeam) => r.thickness.filter((t): t is number => t !== null)
  const unknown = resolved.filter((r) => r.limits.minMm === null)
  if (unknown.length > 0) {
    hints.push({ level: 'amber', text: 'The plate thickness is unknown, so the leg limits cannot be checked. Enter it under Geometry.' })
  }
  const withLimits = resolved.filter((r) => r.limits.minMm !== null)
  if (withLimits.length > 0) {
    const mins = withLimits.map((r) => r.limits.minMm!)
    const text =
      resolved.length === 1
        ? `Minimum ${mm(mins[0]!)} mm for the ${mm(Math.max(...known(withLimits[0]!)))} mm plate (AWS D1.1).`
        : `Minimum ${[...new Set([Math.min(...mins), Math.max(...mins)])].map(mm).join(' to ')} mm, by plate thickness (AWS D1.1).`
    hints.unshift({ level: 'info', text })
  }
  const withMax = resolved.filter((r) => r.limits.maxMm !== null)
  if (withMax.length > 0) {
    const maxes = withMax.map((r) => r.limits.maxMm!)
    hints.push({
      level: 'info',
      text:
        resolved.length === 1
          ? `At most ${mm(maxes[0]!)} mm along the edge of the ${mm(Math.min(...known(withMax[0]!)))} mm plate.`
          : `At most ${[...new Set([Math.min(...maxes), Math.max(...maxes)])].map(mm).join(' to ')} mm along a plate edge, by plate thickness.`,
    })
  }
  for (const r of resolved) {
    const leg = r.leg.legMm
    const { minMm, maxMm } = r.limits
    if (minMm !== null && leg < minMm) hints.push({ level: 'red', text: `${leg.toFixed(1)} mm is below the ${mm(minMm)} mm minimum.` })
    if (maxMm !== null && leg > maxMm) {
      hints.push({ level: 'red', text: `${leg.toFixed(1)} mm is above the ${mm(maxMm)} mm the ${mm(Math.min(...known(r)))} mm plate edge allows.` })
    }
  }
  if (resolved.some((r) => r.leg.legMm > MULTI_PASS_LEG_MM)) {
    hints.push({ level: 'amber', text: `A leg above ${MULTI_PASS_LEG_MM} mm usually needs more than one pass.` })
  }
  return hints.filter((h, i) => hints.findIndex((o) => o.text === h.text) === i)
}
