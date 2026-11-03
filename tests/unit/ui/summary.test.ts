import { beforeEach, describe, expect, it } from 'vitest'
import { importBuffer } from '../../../src/state/flows'
import { selectStats } from '../../../src/state/selectors'
import { useStore } from '../../../src/state/store'
import { seamRows } from '../../../src/ui/panels/seamRows'
import { cycleField, formatCycle, partChip, statusFields } from '../../../src/ui/shell/summary'
import { detected, fakeClient, partInfo, readyOutcome, resetStore, seam } from '../helpers/state'

const fields = () => {
  const state = useStore.getState()
  return statusFields(selectStats(state), state.part !== null)
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
      note: 'Pre-flight: no part loaded',
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
    expect(fields().note).toBe('Pre-flight: not run yet')
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
  it('says no part is loaded', () => {
    expect(partChip(null)).toEqual({ name: 'No part loaded', units: 'units: none' })
  })

  it('names the file and its units', () => {
    expect(partChip(partInfo({ name: 'box-beam.stl' }))).toEqual({ name: 'box-beam.stl', units: 'units: mm' })
  })

  it('says when the file was converted from another unit', () => {
    expect(partChip(partInfo({ sourceUnits: 'in', scaleToMm: 25.4 })).units).toBe('units: mm (from in)')
  })
})

describe('seamRows', () => {
  it('numbers the seams in order and reads their status from the status map', () => {
    const rows = seamRows([seam('a', 0.9, 600), seam('b', 0.8, 157.08), seam('c', 0.5, 20)], { a: 'accepted', c: 'rejected' }, {})
    const fillet = { type: 'Fillet', jointType: 'fillet', computedType: 'fillet', overridden: false, pos: '-', position: null, wps: 'WPS not set', acc: '-', accClass: null, accTitle: '', accPending: false }
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

describe('cycleField', () => {
  const timing = { seams: [], moves: [], arcTimeS: 60, airTimeS: 15, cycleTimeS: 75 }

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
