import { describe, expect, it } from 'vitest'
import type { SeamPosition } from '../../../src/core/torch/positions'
import { positionLines, seamRows } from '../../../src/ui/panels/seamRows'
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

