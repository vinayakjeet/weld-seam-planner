import { describe, expect, it } from 'vitest'
import { xrayMaterial } from '../../../src/ui/viewport/xray'

describe('xrayMaterial', () => {
  it('makes the part about a quarter opaque, see-through and not writing depth, when on', () => {
    const m = xrayMaterial(true)
    expect(m.opacity).toBeGreaterThan(0.15)
    expect(m.opacity).toBeLessThan(0.35)
    expect(m.transparent).toBe(true)
    expect(m.depthWrite).toBe(false)
  })

  it('is the plain opaque material when off', () => {
    expect(xrayMaterial(false)).toEqual({ opacity: 1, transparent: false, depthWrite: true })
  })
})
