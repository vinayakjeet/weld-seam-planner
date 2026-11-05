import { expect, it } from 'vitest'
import { haloFor, lineSet } from '../../../src/ui/viewport/lineSet'

const positions = new Float32Array([0, 0, 0, 10, 0, 0])
const halo = { color: '#030500', extraPx: 3 }

it('lifts even a base line towards the camera, so a face in a crease cannot cut it', () => {
  const base = lineSet(positions, { width: 4, color: '#ffffff' })
  expect(base.material.polygonOffset).toBe(true)
  expect(base.material.polygonOffsetFactor).toBeLessThan(0)
  expect(base.material.polygonOffsetUnits).toBeLessThan(0)
})

it('orders the layers halo, base, selected, hovered from far to near', () => {
  const base = lineSet(positions, { width: 4, color: '#ffffff', renderOrder: 0 })
  const selected = lineSet(positions, { width: 5, color: '#ffffff', renderOrder: 1 })
  const hovered = lineSet(positions, { width: 5, color: '#ffffff', renderOrder: 2 })
  const under = haloFor(base, halo)
  const magnitudes = [under, base, selected, hovered].map((lines) => -lines.material.polygonOffsetFactor)
  expect([...magnitudes].sort((a, b) => a - b)).toEqual(magnitudes)
  expect(new Set(magnitudes).size).toBe(4)
})

it('keeps a line below the base layer lighter than the base', () => {
  const edges = lineSet(positions, { width: 1, color: '#ffffff', renderOrder: -2 })
  const base = lineSet(positions, { width: 4, color: '#ffffff' })
  expect(-edges.material.polygonOffsetFactor).toBeLessThan(-haloFor(base, halo).material.polygonOffsetFactor)
})

it('makes the halo see-through at 60 percent so the line stays the dominant colour', () => {
  const under = haloFor(lineSet(positions, { width: 4, color: '#ffffff' }), halo)
  expect(under.material.transparent).toBe(true)
  expect(under.material.opacity).toBeCloseTo(0.6, 9)
})

it('multiplies the halo opacity with a dimmed line', () => {
  const under = haloFor(lineSet(positions, { width: 4, color: '#ffffff', opacity: 0.5 }), halo)
  expect(under.material.opacity).toBeCloseTo(0.3, 9)
})

it('draws every line in the transparent pass, so render order alone decides which line lies over which', () => {
  expect(lineSet(positions, { width: 4, color: '#ffffff' }).material.transparent).toBe(true)
  expect(lineSet(positions, { width: 4, color: '#ffffff', renderOrder: 1 }).material.transparent).toBe(true)
})
