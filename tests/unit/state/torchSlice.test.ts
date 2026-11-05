import { beforeEach, describe, expect, it } from 'vitest'
import type { Vec3 } from '../../../src/core/math/vec3'
import { DEFAULT_GRAVITY, type SeamPosition } from '../../../src/core/torch/positions'
import { GRAVITY_PRESETS, gravityText, posesFor, positionFor, presetFor } from '../../../src/state/torchSlice'
import { useStore } from '../../../src/state/store'
import { resetStore, seam } from '../helpers/state'

const state = () => useStore.getState()
const summary = (code: string): SeamPosition => ({ code, inclinationDeg: 0, rotationDeg: 135, shares: { [code]: 1 } })

beforeEach(resetStore)

describe('gravity presets', () => {
  it('offers the six axis directions, Z up first and equal to the default', () => {
    expect(GRAVITY_PRESETS).toHaveLength(6)
    expect(GRAVITY_PRESETS[0]!.gravity).toEqual(DEFAULT_GRAVITY)
    expect(GRAVITY_PRESETS[0]!.label).toBe('Z up')
    expect(new Set(GRAVITY_PRESETS.map((p) => p.label)).size).toBe(6)
  })

  it('points gravity opposite to up: X up is gravity along minus X', () => {
    const byLabel = Object.fromEntries(GRAVITY_PRESETS.map((p) => [p.label, p.gravity]))
    expect(byLabel['X up']).toEqual([-1, 0, 0])
    expect(byLabel['Y down']).toEqual([0, 1, 0])
    expect(byLabel['Z down']).toEqual([0, 0, 1])
  })

  it('every preset is a unit axis', () => {
    for (const { gravity } of GRAVITY_PRESETS) expect(Math.hypot(...gravity)).toBe(1)
  })

  it('recognises a preset whatever the length of the vector, and nothing else', () => {
    expect(presetFor([0, 0, -9.81])?.label).toBe('Z up')
    expect(presetFor([-3, 0, 0])?.label).toBe('X up')
    expect(presetFor([0, -1, -1])).toBeNull()
  })

  it('writes a preset by name and anything else as the vector', () => {
    expect(gravityText([0, 0, -1])).toBe('Z up')
    expect(gravityText([0, -1, -1])).toBe('Custom (0, -1, -1)')
  })
})

describe('setGravity', () => {
  it('starts as Z up', () => {
    expect(state().gravity).toEqual([0, 0, -1])
  })

  it('stores a usable vector as given and returns null', () => {
    expect(state().setGravity([1, 0, -1])).toBeNull()
    expect(state().gravity).toEqual([1, 0, -1])
  })

  it('refuses zero and non finite input with what, why and next, and keeps the previous gravity', () => {
    state().setGravity([-1, 0, 0])
    for (const bad of [[0, 0, 0], [Number.NaN, 0, -1], [0, 0, Infinity]] as Vec3[]) {
      const refusal = state().setGravity(bad)
      expect(refusal).not.toBeNull()
      for (const part of [refusal!.what, refusal!.why, refusal!.next]) expect(part.trim().length).toBeGreaterThan(0)
      expect(state().gravity).toEqual([-1, 0, 0])
    }
  })

  it('is a setting, not undo history', () => {
    state().setGravity([-1, 0, 0])
    expect(useStore.temporal.getState().pastStates).toHaveLength(0)
  })

  it('does not notify when the vector is unchanged', () => {
    let notified = 0
    const stop = useStore.subscribe(() => notified++)
    state().setGravity([0, 0, -1])
    stop()
    expect(notified).toBe(0)
  })
})

describe('setScrub', () => {
  it('stores a finite arc length, and never a negative one', () => {
    state().setScrub(42.5)
    expect(state().scrubS).toBe(42.5)
    state().setScrub(-3)
    expect(state().scrubS).toBe(0)
  })

  it('ignores a value that is not a number', () => {
    state().setScrub(10)
    state().setScrub(Number.NaN)
    state().setScrub(Infinity)
    expect(state().scrubS).toBe(10)
  })
})

describe('positions and poses', () => {
  const a = seam('a')
  const gravity: Vec3 = [0, 0, -1]

  it('reads a position only for the very seam and gravity it was computed for', () => {
    state().setPositions({ a: { seam: a, gravity, reversed: false, position: summary('PB') } })
    expect(positionFor(state(), a)?.code).toBe('PB')
    expect(positionFor(state(), { ...a })).toBeUndefined()
    useStore.setState({ order: [{ seamId: 'a', reversed: true, locked: false }] })
    expect(positionFor(state(), a), 'worked out for the other direction').toBeUndefined()
    useStore.setState({ order: [] })
    state().setGravity([-1, 0, 0])
    expect(positionFor(state(), a)).toBeUndefined()
  })

  it('has no position for a seam that was never computed', () => {
    expect(positionFor(state(), a)).toBeUndefined()
  })

  it('reads poses only for the seam they were computed for', () => {
    const poses = [{ s: 0, p: [0, 0, 0] as Vec3, q: [0, 0, 0, 1] as [number, number, number, number], approach: [0, 0, -50] as Vec3, retract: [0, 0, -50] as Vec3 }]
    state().setPoses({ seam: a, poses })
    expect(posesFor(state(), a)).toBe(poses)
    expect(posesFor(state(), seam('a'))).toBeNull()
    state().setPoses(null)
    expect(posesFor(state(), a)).toBeNull()
  })
})
