import { describe, expect, it } from 'vitest'
import type { SeamPosition } from '../../../src/core/torch/positions'
import type { SeamAccess } from '../../../src/core/job/schema'
import { acceptAllState, filterRows, positionLines, seamRows, type RowFilter } from '../../../src/ui/panels/seamRows'
import { reachOf } from '../helpers/reach'
import { seam } from '../helpers/state'

describe('seamRows type column', () => {
  it('capitalises the computed joint type', () => {
    const rows = seamRows([seam('a'), seam('b', 0.9, 200, { jointType: 'lap' })], {}, {})
    expect(rows.map((r) => r.type)).toEqual(['Fillet', 'Lap'])
    expect(rows.map((r) => r.jointType)).toEqual(['fillet', 'lap'])
  })

  it('adds a question mark where the concavity is unknown', () => {
    const rows = seamRows([seam('a', 0.9, 200, { concavity: 'unknown' })], {}, {})
    expect(rows[0]!.type).toBe('Fillet ?')
  })

  it('shows an override instead of the computed type', () => {
    const rows = seamRows([seam('a'), seam('b')], {}, { b: 'saddle' })
    expect(rows.map((r) => r.type)).toEqual(['Fillet', 'Saddle'])
    expect(rows.map((r) => r.overridden)).toEqual([false, true])
    expect(rows[1]!.computedType).toBe('fillet')
    expect(rows[1]!.jointType).toBe('saddle')
  })

  it('drops the question mark once the user has chosen the type', () => {
    const rows = seamRows([seam('a', 0.9, 200, { concavity: 'unknown' })], {}, { a: 'fillet' })
    expect(rows[0]!.type).toBe('Fillet')
    expect(rows[0]!.overridden).toBe(true)
  })

  it('keeps numbering, length and status', () => {
    const rows = seamRows([seam('a', 0.9, 200.04), seam('b', 0.9, 35)], { b: 'accepted' }, {})
    expect(rows.map((r) => [r.n, r.length, r.status])).toEqual([[1, '200', 'candidate'], [2, '35', 'accepted']])
  })
})

describe('seamRows position column', () => {
  const flat: SeamPosition = { code: 'PB', inclinationDeg: 0.04, rotationDeg: 135.2, shares: { PB: 1 } }
  const mixed: SeamPosition = { code: 'PB+', inclinationDeg: 3, rotationDeg: 140, shares: { PB: 0.88, PD: 0.12 } }

  it('shows a dash until a position is known, and nothing for the chip', () => {
    const rows = seamRows([seam('a')], {}, {})
    expect(rows[0]!.pos).toBe('-')
    expect(rows[0]!.position).toBeNull()
  })

  it('shows the code the position lookup gives for that seam, with the plus for a mixed seam', () => {
    const a = seam('a')
    const b = seam('b')
    const rows = seamRows([a, b], {}, {}, (s) => (s === a ? flat : s === b ? mixed : undefined))
    expect(rows.map((r) => r.pos)).toEqual(['PB', 'PB+'])
    expect(rows[1]!.position).toBe(mixed)
  })

  it('asks for the position of the seam itself, so an edited seam does not show the old answer', () => {
    const a = seam('a')
    const asked: unknown[] = []
    seamRows([a], {}, {}, (s) => {
      asked.push(s)
      return undefined
    })
    expect(asked).toEqual([a])
  })
})

describe('positionLines', () => {
  it('names the position, the AWS position, the inclination and the rotation', () => {
    expect(positionLines({ code: 'PB', inclinationDeg: 0.04, rotationDeg: 135.2, shares: { PB: 1 } })).toEqual([
      'PB Horizontal (AWS 2F)',
      'Inclination 0.0\u00b0',
      'Rotation 135.2\u00b0',
    ])
  })

  it('names every position', () => {
    const first = (code: string) => positionLines({ code, inclinationDeg: 0, rotationDeg: 0, shares: { [code.replace('+', '')]: 1 } })[0]
    expect(first('PA')).toBe('PA Flat (AWS 1F)')
    expect(first('PD')).toBe('PD Overhead (AWS 4F)')
    expect(first('PF')).toBe('PF Vertical up (AWS 3F)')
    expect(first('PG')).toBe('PG Vertical down (AWS 3F)')
  })

  it('adds the other positions of a mixed seam with their share, largest first', () => {
    const lines = positionLines({ code: 'PB+', inclinationDeg: 3, rotationDeg: 140, shares: { PB: 0.7, PD: 0.2, PA: 0.1 } })
    expect(lines[0]).toBe('PB+ Horizontal (AWS 2F)')
    expect(lines).toContain('Also PD 20%, PA 10%')
  })

  it('uses no dash characters', () => {
    const text = positionLines({ code: 'PB+', inclinationDeg: 3, rotationDeg: 140, shares: { PB: 0.7, PD: 0.3 } }).join(' ')
    expect(text).not.toMatch(new RegExp('[\\u2013\\u2014]'))
  })
})


describe('seamRows procedure column', () => {
  it('shows the assigned procedure id, or "WPS not set"', () => {
    const rows = seamRows([seam('a'), seam('b')], {}, {}, () => undefined, { b: 'WPS-GTAW' })
    expect(rows.map((r) => r.wps)).toEqual(['WPS not set', 'WPS-GTAW'])
  })

  it('shows "WPS not set" when no map is given', () => {
    expect(seamRows([seam('a')], {}, {})[0]!.wps).toBe('WPS not set')
  })
})

describe('seamRows access column', () => {
  const access = (cls: SeamAccess['class']): SeamAccess => ({ clearanceDeg: 40, nearClearanceDeg: 40, class: cls, portId: null, reachCoverage: null, unreachable: [] })
  const rowsWith = (byId: Record<string, SeamAccess>, analysing: boolean) =>
    seamRows([seam('a'), seam('b'), seam('c')], { a: 'accepted', b: 'accepted' }, {}, undefined, {}, (s) => byId[s.id] ?? null, analysing)

  it('puts the class chip value in the column', () => {
    const rows = rowsWith({ a: access('slim'), b: access('blocked') }, false)
    expect(rows.map((r) => r.acc)).toEqual(['SLM', 'BLK', '-'])
    expect(rows.map((r) => r.accClass)).toEqual(['slim', 'blocked', null])
  })

  it('shows a neutral value for an accepted seam while the analysis runs, and for seams not accepted', () => {
    const rows = rowsWith({ a: access('standard') }, true)
    expect(rows.map((r) => r.acc)).toEqual(['STD', '-', '-'])
    expect(rows.map((r) => r.accPending)).toEqual([false, true, false])
  })

  it('is neutral and not pending when nothing is running', () => {
    const rows = rowsWith({}, false)
    expect(rows.map((r) => [r.acc, r.accClass, r.accPending])).toEqual([['-', null, false], ['-', null, false], ['-', null, false]])
  })

  it('shows a seam with no class yet (empty analysis) as neutral', () => {
    const rows = rowsWith({ a: access(null) }, false)
    expect(rows[0]!.acc).toBe('-')
  })
})

describe('acceptAllState', () => {
  const seams = [seam('a'), seam('b'), seam('c')]

  it('reads Accept all above the threshold while a seam is still a candidate', () => {
    expect(acceptAllState(seams, { a: 'accepted' }, 0.7)).toEqual({ disabled: false, label: 'Accept all above 0.70', reason: null })
  })

  it('counts a rejected seam as a candidate, as accepting all does', () => {
    expect(acceptAllState(seams, { a: 'accepted', b: 'accepted', c: 'rejected' }, 0.7).disabled).toBe(false)
  })

  it('is disabled and reads All seams accepted when none is left', () => {
    const all = { a: 'accepted', b: 'accepted', c: 'accepted' } as const
    expect(acceptAllState(seams, all, 0.7)).toEqual({ disabled: true, label: 'All seams accepted', reason: null })
  })

  it('is disabled with the reason when there are no seams', () => {
    const state = acceptAllState([], {}, 0.7)
    expect(state.disabled).toBe(true)
    expect(state.label).toBe('Accept all above 0.70')
    expect(state.reason).toBe('There are no seams to accept. Load a part, or lower the crease angle in the Detection tab.')
  })
})

describe('seamRows reach', () => {
  const access = { clearanceDeg: 5, nearClearanceDeg: 5, class: 'snake' as const, portId: null, reachCoverage: null, unreachable: [] }

  it('writes the Acc tooltip with the reach share and port when a current reach exists', () => {
    const [row] = seamRows([seam('a')], { a: 'accepted' }, {}, undefined, {}, () => access, false, () => reachOf(0.734))
    expect(row!.accTitle).toBe('Snake, 73 % reached from P1')
  })

  it('says reach was not run for a snake seam without a current reach', () => {
    const [row] = seamRows([seam('a')], { a: 'accepted' }, {}, undefined, {}, () => access, false, () => null)
    expect(row!.accTitle).toBe('Snake, reach not run')
  })

  it('is the class name alone for a standard seam, and empty without a class', () => {
    const standard = { ...access, class: 'standard' as const }
    expect(seamRows([seam('a')], {}, {}, undefined, {}, () => standard)[0]!.accTitle).toBe('Standard')
    expect(seamRows([seam('a')], {}, {})[0]!.accTitle).toBe('')
  })
})

describe('filterRows', () => {
  const access = (cls: 'standard' | 'blocked') => ({ class: cls }) as unknown as SeamAccess
  const rows = seamRows(
    [seam('a', 0.9), seam('b', 0.4), seam('c', 0.9, 200, { concavity: 'unknown' }), seam('d', 0.9), seam('e', 0.9)],
    { a: 'accepted', d: 'accepted', e: 'rejected' },
    {},
    () => undefined,
    {},
    (s) => (s.id === 'd' ? access('blocked') : null),
  )
  const keep = (...active: RowFilter[]) => filterRows(rows, new Set(active)).map((r) => r.id)

  it('flags low confidence, an unknown inside and a blocked access as warnings', () => {
    expect(rows.map((r) => r.warning)).toEqual([false, true, true, true, false])
  })

  it('shows every row while no chip is on', () => {
    expect(keep()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('Candidates keeps the seams that are neither accepted nor rejected', () => {
    expect(keep('candidates')).toEqual(['b', 'c'])
  })

  it('Accepted keeps the accepted seams', () => {
    expect(keep('accepted')).toEqual(['a', 'd'])
  })

  it('Warnings keeps the flagged seams whatever their status', () => {
    expect(keep('warnings')).toEqual(['b', 'c', 'd'])
  })

  it('shows rows that match any chip that is on', () => {
    expect(keep('accepted', 'warnings')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps the numbers the table had before filtering', () => {
    expect(filterRows(rows, new Set<RowFilter>(['accepted'])).map((r) => r.n)).toEqual([1, 4])
  })
})
