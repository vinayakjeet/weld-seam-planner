import { describe, expect, it } from 'vitest'
import { sequenceRows } from '../../../src/ui/panels/sequenceRows'
import { seam } from '../helpers/state'

describe('sequenceRows', () => {
  const seams = [seam('a', 0.9, 600), seam('b', 0.9, 157.08, { closed: true }), seam('c', 0.9, 20)]
  const byId = new Map(seams.map((s) => [s.id, s]))

  it('numbers the rows by their place in the sequence, not by table position', () => {
    const rows = sequenceRows([{ seamId: 'c', reversed: false, locked: false }, { seamId: 'a', reversed: false, locked: false }], byId)
    expect(rows.map((r) => [r.n, r.id, r.label, r.length])).toEqual([[1, 'c', 'C', '20'], [2, 'a', 'A', '600']])
  })

  it('says which way a seam is welded and whether it is locked', () => {
    const rows = sequenceRows([{ seamId: 'a', reversed: true, locked: true }, { seamId: 'c', reversed: false, locked: false }], byId)
    expect(rows.map((r) => [r.direction, r.locked])).toEqual([['End to start', true], ['Start to end', false]])
  })

  it('shows a closed loop as a loop, whatever its flag', () => {
    const rows = sequenceRows([{ seamId: 'b', reversed: true, locked: false }], byId)
    expect(rows[0]!.direction).toBe('Loop')
  })

  it('skips an id that no seam has', () => {
    expect(sequenceRows([{ seamId: 'gone', reversed: false, locked: false }], byId)).toEqual([])
  })
})
