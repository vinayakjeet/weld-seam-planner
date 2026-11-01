import { describe, expect, it } from 'vitest'
import { defaultUnits, sizeInMm, UNIT_CHOICES } from '../../../src/ui/viewport/unitChoices'

describe('unit choices', () => {
  it('offers millimetres, inches and metres in that order', () => {
    expect(UNIT_CHOICES.map((c) => c.units)).toEqual(['mm', 'in', 'm'])
    for (const choice of UNIT_CHOICES) expect(choice.label.trim().length).toBeGreaterThan(0)
  })

  it.each([
    ['mm', 'mm'],
    ['in', 'in'],
    ['m', 'm'],
    ['unknown', 'mm'],
  ] as const)('preselects %s guess as %s', (guess, expected) => {
    expect(defaultUnits(guess)).toBe(expected)
  })

  it('converts the largest dimension to millimetres for each choice', () => {
    expect(sizeInMm(7.874, 'mm')).toBeCloseTo(7.874, 6)
    expect(sizeInMm(7.874, 'in')).toBeCloseTo(200, 1)
    expect(sizeInMm(0.2, 'm')).toBeCloseTo(200, 6)
  })
})
