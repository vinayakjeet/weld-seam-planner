import { describe, expect, it } from 'vitest'
import { rotate, type Quat } from '../../../src/core/math/quat'
import { length, sub, type Vec3 } from '../../../src/core/math/vec3'
import { DEFAULT_TORCH, torchPoses } from '../../../src/core/torch/frames'
import { pointsFromPolyline } from '../../../src/core/seams/frames'
import { DISPLAY_CTWD_MM, placeTorch } from '../../../src/ui/viewport/torchModel'

const IDENTITY: Quat = [0, 0, 0, 1]
const pose = (p: Vec3, q: Quat) => ({ p, q })
const finite = (v: readonly number[]) => v.every(Number.isFinite)

describe('placeTorch with a contact tip distance', () => {
  it('puts the nozzle tip that many mm back from the seam point, in place of the default', () => {
    const model = placeTorch(pose([10, 20, 30], IDENTITY), 1, 22)!
    expect(model.wire.tip).toEqual([10, 20, 30])
    expect(model.nozzle.tip).toEqual([10, 20, 8])
  })

  it('scales the distance with the display scale like every other dimension', () => {
    const model = placeTorch(pose([0, 0, 0], IDENTITY), 2, 20)!
    expect(model.nozzle.tip).toEqual([0, 0, -40])
  })

  it('keeps the nozzle and body lengths whatever the distance', () => {
    const near = placeTorch(pose([0, 0, 0], IDENTITY), 1, 10)!
    const far = placeTorch(pose([0, 0, 0], IDENTITY), 1, 30)!
    expect(near.nozzle.tip[2]! - near.nozzle.base[2]!).toBeCloseTo(far.nozzle.tip[2]! - far.nozzle.base[2]!, 9)
    expect(near.body.tip[2]! - near.body.base[2]!).toBeCloseTo(far.body.tip[2]! - far.body.base[2]!, 9)
  })

  it('falls back to the default for a distance that is null, zero, negative or not finite', () => {
    for (const bad of [null, 0, -5, Number.NaN, Infinity]) expect(placeTorch(pose([0, 0, 0], IDENTITY), 1, bad)!.nozzle.tip, String(bad)).toEqual([0, 0, -15])
  })
})

describe('placeTorch', () => {
  it('puts the wire tip on the seam point and the nozzle tip the display CTWD back along minus z', () => {
    const model = placeTorch(pose([10, 20, 30], IDENTITY))!
    expect(model.wire.tip).toEqual([10, 20, 30])
    expect(DISPLAY_CTWD_MM).toBe(15)
    expect(model.nozzle.tip).toEqual([10, 20, 15])
  })

  it('stacks wire, nozzle and body end to end along the tool axis, away from the joint', () => {
    const model = placeTorch(pose([0, 0, 0], IDENTITY))!
    expect(model.wire.base).toEqual(model.nozzle.tip)
    expect(model.nozzle.base).toEqual(model.body.tip)
    expect(model.body.base[2]).toBeLessThan(model.nozzle.base[2])
    expect(model.nozzle.base[2]).toBeLessThan(model.nozzle.tip[2])
  })

  it('follows the pose: the axis from base to tip is the rotated tool z', () => {
    const half = Math.SQRT1_2
    const q: Quat = [half, 0, 0, half]
    const placed = placeTorch(pose([5, 5, 5], q))!
    const axis = rotate(q, [0, 0, 1])
    const along = sub(placed.wire.tip, placed.body.base)
    const unit = [along[0] / length(along), along[1] / length(along), along[2] / length(along)]
    for (let i = 0; i < 3; i++) expect(unit[i]).toBeCloseTo(axis[i]!, 9)
  })

  it('scales every dimension with the display scale, and the wire still ends on the point', () => {
    const big = placeTorch(pose([1, 2, 3], IDENTITY), 2)!
    expect(big.wire.tip).toEqual([1, 2, 3])
    expect(big.nozzle.tip[2]).toBeCloseTo(3 - 30, 9)
  })

  it('has positive radii that taper from base to tip', () => {
    const model = placeTorch(pose([0, 0, 0], IDENTITY))!
    for (const part of [model.wire, model.nozzle, model.body]) {
      expect(part.tipRadius).toBeGreaterThan(0)
      expect(part.baseRadius).toBeGreaterThanOrEqual(part.tipRadius)
    }
  })

  it('has no NaN for a pose that comes out of the torch maths', () => {
    const { points } = pointsFromPolyline([[0, 0, 0], [100, 0, 0]], false, () => [[0, 0, 1], [0, -1, 0]])
    for (const p of torchPoses(points, false, DEFAULT_TORCH)) {
      const model = placeTorch(p)!
      for (const part of [model.wire, model.nozzle, model.body]) expect(finite([...part.tip, ...part.base, part.tipRadius, part.baseRadius])).toBe(true)
    }
  })

  it('draws nothing for a degenerate pose: not finite, or a quaternion that is not a rotation', () => {
    expect(placeTorch(pose([Number.NaN, 0, 0], IDENTITY))).toBeNull()
    expect(placeTorch(pose([0, 0, 0], [Number.NaN, 0, 0, 1]))).toBeNull()
    expect(placeTorch(pose([0, 0, 0], [0, 0, 0, 0]))).toBeNull()
    expect(placeTorch(pose([0, 0, Infinity], IDENTITY))).toBeNull()
  })

  it('draws nothing for a scale that is not positive and finite', () => {
    expect(placeTorch(pose([0, 0, 0], IDENTITY), 0)).toBeNull()
    expect(placeTorch(pose([0, 0, 0], IDENTITY), Number.NaN)).toBeNull()
  })
})
