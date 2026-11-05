import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../../../src/core/math/vec3'
import { LIGHT_RIG, brightnessOf, displayedBrightnessOf, type LightRig } from '../../../src/ui/viewport/lighting'

// The three faces the default camera sees on a box: top, front (minus y) and right (plus x).
const TOP: Vec3 = [0, 0, 1]
const FRONT: Vec3 = [0, -1, 0]
const RIGHT: Vec3 = [1, 0, 0]

describe('light rig', () => {
  it('makes the three visible faces of a box clearly different, about 1.0, 0.75 and 0.55', () => {
    const top = displayedBrightnessOf(TOP)
    expect(displayedBrightnessOf(FRONT) / top).toBeGreaterThan(0.72)
    expect(displayedBrightnessOf(FRONT) / top).toBeLessThan(0.78)
    expect(displayedBrightnessOf(RIGHT) / top).toBeGreaterThan(0.52)
    expect(displayedBrightnessOf(RIGHT) / top).toBeLessThan(0.58)
  })

  it('keeps the brightest face at the part colour and never above it', () => {
    expect(brightnessOf(TOP)).toBeLessThanOrEqual(1)
    expect(brightnessOf(TOP)).toBeGreaterThan(0.9)
  })

  it('lights the faces turned away from both lights by the ambient light alone', () => {
    const rig: LightRig = LIGHT_RIG
    expect(rig.ambient).toBeGreaterThan(0)
    expect(brightnessOf([0, 0, -1])).toBeGreaterThan(0)
    expect(brightnessOf([0, 0, -1])).toBeLessThan(brightnessOf(RIGHT))
  })

  it('puts the fill lower and weaker than the key', () => {
    expect(LIGHT_RIG.fill.intensity).toBeLessThan(LIGHT_RIG.key.intensity)
    expect(LIGHT_RIG.fill.position[2]).toBeLessThan(LIGHT_RIG.key.position[2])
  })
})
