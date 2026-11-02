import { describe, expect, it } from 'vitest'
import { seamRows } from '../../../src/ui/panels/seamRows'
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
