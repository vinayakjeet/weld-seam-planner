import { beforeEach, describe, expect, it } from 'vitest'
import { importBuffer } from '../../../src/state/flows'
import { selectStats } from '../../../src/state/selectors'
import { useStore } from '../../../src/state/store'
import { seamRows } from '../../../src/ui/panels/seamRows'
import { planTiming } from '../../../src/core/job/timing'
import { preflight } from '../../../src/core/job/preflight'
import { ARC_NEEDS_PROCEDURE, arcTimeHint, cleaningField, cycleField, formatCycle, partChip, preflightNote, statusFields } from '../../../src/ui/shell/summary'
import { specExamplePlan } from '../helpers/jobs'
import { detected, fakeClient, partInfo, readyOutcome, resetStore, seam } from '../helpers/state'

const fields = () => {
  const state = useStore.getState()
  return statusFields(selectStats(state))
}
const value = (label: string) => fields().fields.find((f) => f.label === label)?.value

beforeEach(resetStore)

describe('statusFields', () => {
  it('shows zeros before any part is loaded', () => {
    expect(fields()).toEqual({
      fields: [
        { label: 'Triangles', value: '0' },
        { label: 'Bodies', value: '0' },
        { label: 'Seams accepted / candidate', value: '0 / 0' },
        { label: 'Weld length', value: '0 mm' },
      ],
    })
  })

  it('shows the counts of a part loaded through the real import flow', async () => {
    const seams = Array.from({ length: 8 }, (_, i) => seam(`s${i}`, 1, 600))
    const client = fakeClient({
      loadStl: async () => readyOutcome({ triangles: 1040000, bodies: 1 }),
      detect: async () => detected(seams),
    })
    await importBuffer(new ArrayBuffer(8), 'box-beam.stl', client)
    expect(value('Triangles')).toBe('1,040,000')
    expect(value('Bodies')).toBe('1')
    expect(value('Seams accepted / candidate')).toBe('0 / 8')
  })

  it('counts accepted seams and sums their weld length', async () => {
    const client = fakeClient({
      loadStl: async () => readyOutcome(),
      detect: async () => detected([seam('a', 1, 200), seam('b', 1, 200), seam('c', 1, 35.25)]),
    })
    await importBuffer(new ArrayBuffer(8), 'a.stl', client)
    useStore.getState().toggleAccepted('a')
    useStore.getState().toggleAccepted('b')
    expect(value('Seams accepted / candidate')).toBe('2 / 1')
    expect(value('Weld length')).toBe('400 mm')
    useStore.getState().toggleAccepted('c')
    expect(value('Weld length')).toBe('435.3 mm')
  })
})

describe('partChip', () => {
  it('says no part is loaded, with no units chip', () => {
    expect(partChip(null)).toEqual({ name: 'No part loaded', file: '', units: null, unitsTitle: '' })
  })

  it('names the part without its .stl ending, keeps the file name for the tooltip and gives the units', () => {
    expect(partChip(partInfo({ name: 'box-beam.stl' }))).toEqual({ name: 'box-beam', file: 'box-beam.stl', units: 'mm', unitsTitle: 'Units: millimetres' })
    expect(partChip(partInfo({ name: 'Bracket.STL' })).name).toBe('Bracket')
    expect(partChip(partInfo({ name: 'notes' })).name).toBe('notes')
  })

  it('says when the file was converted from another unit', () => {
    const chip = partChip(partInfo({ sourceUnits: 'in', scaleToMm: 25.4 }))
    expect(chip.units).toBe('mm, from in')
    expect(chip.unitsTitle).toBe('Converted from in to millimetres on import')
  })
})

describe('seamRows', () => {
  it('numbers the seams in order and reads their status from the status map', () => {
    const rows = seamRows([seam('a', 0.9, 600), seam('b', 0.8, 157.08), seam('c', 0.5, 20)], { a: 'accepted', c: 'rejected' }, {})
    const fillet = { type: 'Fillet', jointType: 'fillet', computedType: 'fillet', overridden: false, pos: '-', position: null, wps: 'WPS not set', acc: '-', accClass: null, accTitle: '', accPending: false, warning: false }
    expect(rows).toEqual([
      { id: 'a', n: 1, label: 'A', ...fillet, length: '600', status: 'accepted' },
      { id: 'b', n: 2, label: 'B', ...fillet, length: '157.1', status: 'candidate' },
      { id: 'c', n: 3, label: 'C', ...fillet, length: '20', status: 'rejected' },
    ])
  })

  it('is empty for no seams', () => {
    expect(seamRows([], {}, {})).toEqual([])
  })
})

describe('formatCycle', () => {
  it('writes minutes and seconds, and hours from one hour', () => {
    expect(formatCycle(0)).toBe('0:00')
    expect(formatCycle(75)).toBe('1:15')
    expect(formatCycle(3599.4)).toBe('59:59')
    expect(formatCycle(3725)).toBe('1:02:05')
  })

  it('shows 0:00 for a value that is not a time', () => {
    expect(formatCycle(-5)).toBe('0:00')
    expect(formatCycle(Number.NaN)).toBe('0:00')
  })
})

describe('cleaningField', () => {
  const base = { seams: [], moves: [], arcTimeS: 600, airTimeS: 60, cycleTimeS: 750 }

  it('is empty with no timing, no cleaning, or an answer from before cleaning was modelled', () => {
    expect(cleaningField(null)).toBeNull()
    expect(cleaningField({ ...base, cleanings: 0, cleaningS: 0 })).toBeNull()
    expect(cleaningField(base as never)).toBeNull()
  })

  it('names the stops and their total time', () => {
    expect(cleaningField({ ...base, cleanings: 2, cleaningS: 60 })).toBe('2 stops, 1:00')
    expect(cleaningField({ ...base, cleanings: 1, cleaningS: 30 })).toBe('1 stop, 0:30')
  })
})

describe('cycleField', () => {
  const timing = { seams: [], moves: [], arcTimeS: 60, airTimeS: 15, cleanings: 0, cleaningS: 0, cycleTimeS: 75 }

  it('shows the timing of the current plan as it is', () => {
    expect(cycleField(timing, true)).toEqual({ value: '1:15', stale: false })
  })

  it('shows the previous timing dimmed while the plan has moved on', () => {
    expect(cycleField(timing, false)).toEqual({ value: '1:15', stale: true })
  })

  it('shows 0:00 before any timing, never dimmed', () => {
    expect(cycleField(null, false)).toEqual({ value: '0:00', stale: false })
  })
})

describe('arcTimeHint', () => {
  const twoSeams = () =>
    specExamplePlan([
      { id: 's1', from: [0, 0, 12], to: [800, 0, 12] },
      { id: 's2', from: [0, 300, 12], to: [800, 300, 12] },
    ])

  it('explains an arc time of 0:00 when the accepted seams have no procedure', () => {
    const plan = twoSeams()
    for (const seam of plan.seams) seam.procedureId = null
    const timing = planTiming(plan)
    expect(formatCycle(timing.arcTimeS)).toBe('0:00')
    expect(arcTimeHint(plan, timing)).toBe(ARC_NEEDS_PROCEDURE)
    expect(ARC_NEEDS_PROCEDURE).toBe('Arc time needs a procedure. Assign one in step 3.')
  })

  it('counts a procedure that is no longer in the library as none', () => {
    const plan = twoSeams()
    for (const seam of plan.seams) seam.procedureId = 'WPS-DELETED'
    expect(arcTimeHint(plan, planTiming(plan))).toBe(ARC_NEEDS_PROCEDURE)
  })

  it('says nothing once arc time is counted, or when every seam has a procedure, or with no accepted seams', () => {
    const some = twoSeams()
    some.seams[0]!.procedureId = null
    expect(arcTimeHint(some, planTiming(some))).toBeNull()
    const all = twoSeams()
    expect(arcTimeHint(all, planTiming(all))).toBeNull()
    expect(arcTimeHint(all, null)).toBeNull()
    expect(arcTimeHint({ ...all, seams: [] }, null)).toBeNull()
  })
})

describe('preflightNote', () => {
  it('says there is no part, then that the check is running until its answer is for the current plan', () => {
    expect(preflightNote(false, [], false)).toBe('Pre-flight: no part loaded')
    expect(preflightNote(true, [], false)).toBe('Pre-flight: checking')
  })

  it('counts the errors and warnings the check found for the plan as it stands', () => {
    const empty = specExamplePlan([])
    expect(preflightNote(true, preflight(empty), true)).toBe('Pre-flight: 1 error, 0 warnings')
    const plan = specExamplePlan()
    plan.seams[0]!.procedureId = null
    const issues = preflight(plan)
    const errors = issues.filter((i) => i.severity === 'error').length
    const warnings = issues.filter((i) => i.severity === 'warning').length
    expect(errors).toBeGreaterThan(0)
    expect(preflightNote(true, issues, true)).toBe(`Pre-flight: ${errors} ${errors === 1 ? 'error' : 'errors'}, ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`)
    expect(preflightNote(true, preflight(specExamplePlan()), true)).toMatch(/^Pre-flight: 0 errors, \d+ warnings?$/)
  })
})
