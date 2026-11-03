import { describe, expect, it } from 'vitest'
import { wpsCode } from '../../../src/ui/panels/wpsCode'

describe('wpsCode', () => {
  it('drops the WPS prefix and the process when the id is long', () => {
    expect(wpsCode({ id: 'WPS-GMAW-SPRAY-FW6' })).toBe('SPRAY-FW6')
  })

  it('keeps the process when the id already fits', () => {
    expect(wpsCode({ id: 'WPS-GMAW-SC' })).toBe('GMAW-SC')
    expect(wpsCode({ id: 'WPS-GMAW-PULSE' })).toBe('GMAW-PULSE')
    expect(wpsCode({ id: 'WPS-GTAW' })).toBe('GTAW')
  })

  it('upper-cases the id', () => {
    expect(wpsCode({ id: 'wps-gtaw' })).toBe('GTAW')
  })

  it('cuts a 20 character id to 10 characters', () => {
    expect(wpsCode({ id: 'abcdefghijklmnopqrst' })).toBe('ABCDEFGHIJ')
    expect(wpsCode({ id: 'my-custom-procedure-x1' })).toHaveLength(10)
  })

  it('gives an empty code for an empty id', () => {
    expect(wpsCode({ id: '' })).toBe('')
  })
})
