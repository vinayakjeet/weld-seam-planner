import { describe, expect, it } from 'vitest'
import { WPS_PRESETS, resolveProcedure } from '../../../src/core/process/wps'
import { OVERRIDE_FIELDS, disabledReason, isOverridden, parseOverrideInput, patchFor, sharedValue, valueOf } from '../../../src/ui/panels/overrideFields'

const spray = WPS_PRESETS.find((p) => p.id === 'WPS-GMAW-SPRAY-FW6')!
const field = (key: string) => OVERRIDE_FIELDS.find((f) => f.key === key)!

describe('sharedValue', () => {
  it('is the value when every seam agrees and "mixed" when they differ', () => {
    expect(sharedValue([270, 270])).toBe(270)
    expect(sharedValue([270, 250])).toBe('mixed')
    expect(sharedValue([270])).toBe(270)
    expect(sharedValue([null, null])).toBeNull()
    expect(sharedValue([null, 5])).toBe('mixed')
  })
})

describe('the override fields', () => {
  it('are the eight of the brief, in order', () => {
    expect(OVERRIDE_FIELDS.map((f) => f.label)).toEqual([
      'Current', 'Voltage', 'Wire feed', 'Travel speed', 'Contact tip distance', 'Work angle offset', 'Travel angle', 'Gas flow',
    ])
  })

  it('read their value from a procedure', () => {
    expect(valueOf(spray, field('current'))).toBe(270)
    expect(valueOf(spray, field('travel'))).toBe(9)
    expect(valueOf(spray, field('gasFlow'))).toBe(15)
    expect(valueOf(WPS_PRESETS.find((p) => p.id === 'WPS-GTAW')!, field('wireFeed'))).toBeNull()
  })

  it('build a patch that resolveProcedure applies to the right place', () => {
    for (const f of OVERRIDE_FIELDS) {
      const resolved = resolveProcedure(spray, patchFor(f, 12.5))
      expect(valueOf(resolved, f)).toBe(12.5)
    }
  })

  it('build a patch that clears the key when the value is undefined', () => {
    expect(patchFor(field('current'), undefined)).toEqual({ electrical: { currentA: undefined } })
  })

  it('tell whether a seam overrides a field', () => {
    expect(isOverridden({ electrical: { currentA: 300 } }, field('current'))).toBe(true)
    expect(isOverridden({ electrical: { currentA: 300 } }, field('voltage'))).toBe(false)
    expect(isOverridden({}, field('travel'))).toBe(false)
  })
})

describe('parseOverrideInput', () => {
  it('clears the override on empty input', () => {
    expect(parseOverrideInput(field('current'), '')).toEqual({ kind: 'clear' })
    expect(parseOverrideInput(field('current'), '   ')).toEqual({ kind: 'clear' })
  })

  it('sets a number, with a comma as the decimal mark accepted', () => {
    expect(parseOverrideInput(field('current'), '280')).toEqual({ kind: 'set', value: 280 })
    expect(parseOverrideInput(field('travel'), '7,5')).toEqual({ kind: 'set', value: 7.5 })
  })

  it('refuses text with what, why and next', () => {
    const parsed = parseOverrideInput(field('current'), 'abc')
    expect(parsed.kind).toBe('error')
    if (parsed.kind !== 'error') return
    expect(parsed.error.what).toBe('Current must be a number.')
    expect(parsed.error.why).toContain('abc')
    expect(parsed.error.next.length).toBeGreaterThan(0)
  })

  it('refuses zero where a positive value is needed, and allows a negative work angle offset', () => {
    const zero = parseOverrideInput(field('travel'), '0')
    expect(zero.kind === 'error' && zero.error.what).toBe('Travel speed must be above 0 mm/s.')
    expect(parseOverrideInput(field('workAngle'), '-5')).toEqual({ kind: 'set', value: -5 })
    const negativeTravelAngle = parseOverrideInput(field('travelAngle'), '-1')
    expect(negativeTravelAngle.kind).toBe('error')
  })

  it('refuses infinity', () => {
    expect(parseOverrideInput(field('current'), 'Infinity').kind).toBe('error')
  })
})

describe('disabledReason', () => {
  const noGas = { ...spray, gas: undefined }

  it('disables gas flow on a procedure with no gas mix and says why', () => {
    const reason = disabledReason(field('gasFlow'), [noGas])
    expect(reason).toMatch(/no shielding gas/i)
    expect(reason).toMatch(/choose a procedure/i)
  })

  it('also disables it when any one of several procedures has no gas', () => {
    expect(disabledReason(field('gasFlow'), [spray, noGas])).not.toBeNull()
  })

  it('leaves gas flow and every other field enabled when every procedure has a gas mix', () => {
    expect(disabledReason(field('gasFlow'), [spray])).toBeNull()
    for (const f of OVERRIDE_FIELDS) expect(disabledReason(f, [noGas, spray]) === null).toBe(f.key !== 'gasFlow')
  })
})
