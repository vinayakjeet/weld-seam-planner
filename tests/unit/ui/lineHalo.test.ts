import { Color } from 'three'
import { expect, it } from 'vitest'
import { haloFor, lineSet } from '../../../src/ui/viewport/lineSet'

const positions = new Float32Array([0, 0, 0, 10, 0, 0])
const halo = { color: '#030500', extraPx: 4 }

it('draws the halo wider by the extra pixels, in the halo colour, under the line', () => {
  const base = lineSet(positions, { width: 3, color: '#ffffff' })
  const under = haloFor(base, halo)
  expect(under.material.linewidth).toBe(7)
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
  expect(dim.material.opacity).toBe(0.3)
  const overlay = haloFor(lineSet(positions, { width: 3, color: '#ffffff', overlay: true }), halo)
  expect(overlay.material.depthTest).toBe(false)
})
