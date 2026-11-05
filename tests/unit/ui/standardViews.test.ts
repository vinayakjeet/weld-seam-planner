import { describe, expect, it } from 'vitest'
import { STANDARD_VIEWS, viewEye } from '../../../src/ui/viewport/standardViews'

describe('STANDARD_VIEWS', () => {
  it('has six views, named Front, Back, Left, Right, Top and Bottom in key order', () => {
    expect(STANDARD_VIEWS.map((view) => view.label)).toEqual(['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom'])
  })

  it('looks along one axis each, from the six sides of a z up part', () => {
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-3
    const sides = STANDARD_VIEWS.map(({ direction: [x, y, z] }) => {
      for (const [axis, value] of [['x', x], ['y', y], ['z', z]] as const) if (near(Math.abs(value), 1)) return `${value > 0 ? '+' : '-'}${axis}`
      return null
    })
    // The front camera sits at -y, as the view cube labels it.
    expect(sides).toEqual(['-y', '+y', '-x', '+x', '+z', '-z'])
  })

  it('has unit directions', () => {
    for (const { direction } of STANDARD_VIEWS) expect(Math.hypot(...direction)).toBeCloseTo(1, 9)
  })

  it('tilts the top and bottom views a hair towards y, so that screen up stays +y and the look at is not degenerate', () => {
    for (const index of [4, 5]) {
      const [x, y] = STANDARD_VIEWS[index]!.direction
      expect(x).toBe(0)
      expect(Math.abs(y)).toBeGreaterThan(0)
      expect(Math.abs(y)).toBeLessThan(0.01)
    }
    expect(STANDARD_VIEWS[4]!.direction[1]).toBeLessThan(0)
    expect(STANDARD_VIEWS[5]!.direction[1]).toBeGreaterThan(0)
  })
})

describe('viewEye', () => {
  it('puts the camera the given distance from the target along the direction of the view', () => {
    const eye = viewEye([10, 20, 30], 100, 0)
    expect(eye[0]).toBeCloseTo(10, 6)
    expect(eye[1]).toBeCloseTo(-80, 6)
    expect(eye[2]).toBeCloseTo(30, 6)
  })

  it('keeps the distance for every view', () => {
    for (let i = 0; i < 6; i++) {
      const eye = viewEye([5, -5, 5], 250, i)
      expect(Math.hypot(eye[0] - 5, eye[1] + 5, eye[2] - 5)).toBeCloseTo(250, 6)
    }
  })
})
