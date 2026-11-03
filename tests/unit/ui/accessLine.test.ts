import { describe, expect, it } from 'vitest'
import { accessChipText, accessLabel, accessLine, clearanceText, intervalsText } from '../../../src/ui/panels/accessText'

const CLASSES = ['standard', 'slim', 'snake', 'blocked'] as const
const DASH = new RegExp('[\\u2013\\u2014]')

describe('accessLine', () => {
  it('says exactly what each class needs', () => {
    expect(accessLine('standard')).toBe('any robot torch')
    expect(accessLine('slim')).toBe('slim or swan-neck torch')
    expect(accessLine('snake')).toBe('needs a snake arm entering through an opening')
    expect(accessLine('blocked')).toBe('no tool can reach; weld manually or change the design')
  })

  it('has no en or em dash in any text of the access column', () => {
    for (const cls of CLASSES) {
      for (const text of [accessLine(cls), accessLabel(cls), accessChipText(cls)]) expect(text).not.toMatch(DASH)
    }
  })
})

describe('chip and label text', () => {
  it('gives every class its own short chip text and readable name', () => {
    expect(CLASSES.map(accessChipText)).toEqual(['STD', 'SLM', 'SNK', 'BLK'])
    expect(CLASSES.map(accessLabel)).toEqual(['Standard', 'Slim', 'Snake', 'Blocked'])
  })

  it('writes a clearance as whole degrees and an interval list in millimetres', () => {
    expect(clearanceText(44.6)).toBe('45°')
    expect(clearanceText(0)).toBe('0°')
    expect(intervalsText([[10, 40], [120.4, 200]])).toBe('10 to 40 mm, 120 to 200 mm')
    expect(intervalsText([])).toBe('')
  })
})
