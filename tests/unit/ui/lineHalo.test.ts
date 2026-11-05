import { Color } from 'three'
import { expect, it } from 'vitest'
import { haloFor, lineSet } from '../../../src/ui/viewport/lineSet'

const positions = new Float32Array([0, 0, 0, 10, 0, 0])
const halo = { color: '#030500', extraPx: 3 }

it('draws the halo wider by the extra pixels, in the halo colour, under the line', () => {
  const base = lineSet(positions, { width: 3, color: '#ffffff' })
  const under = haloFor(base, halo)
  expect(under.material.linewidth).toBe(6)
  expect(under.material.color.getHex()).toBe(new Color('#030500').getHex())
  expect(under.renderOrder).toBe(base.renderOrder - 1)
})

it('gives the halo its own material so it can be freed without touching the line', () => {
  const base = lineSet(positions, { width: 3, color: '#ffffff' })
  const under = haloFor(base, halo)
  expect(under.material).not.toBe(base.material)
  expect(under.geometry).toBe(base.geometry)
})

it('follows the line when it is dimmed or drawn over the part', () => {
  const dim = haloFor(lineSet(positions, { width: 3, color: '#ffffff', opacity: 0.3 }), halo)
  expect(dim.material.transparent).toBe(true)
  expect(dim.material.opacity).toBeCloseTo(0.18, 9)
  const overlay = haloFor(lineSet(positions, { width: 3, color: '#ffffff', overlay: true }), halo)
  expect(overlay.material.depthTest).toBe(false)
})

it('writes no depth, so the halo cannot hide the line it sits under', () => {
  expect(haloFor(lineSet(positions, { width: 3, color: '#ffffff' }), halo).material.depthWrite).toBe(false)
})

it('sits a whole depth step behind the line', () => {
  const base = lineSet(positions, { width: 3, color: '#ffffff' })
  const under = haloFor(base, halo)
  expect(under.material.polygonOffsetFactor - base.material.polygonOffsetFactor).toBeGreaterThanOrEqual(1)
  expect(under.material.polygonOffsetUnits - base.material.polygonOffsetUnits).toBeGreaterThanOrEqual(1)
})
