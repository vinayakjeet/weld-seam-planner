import { describe, expect, it } from 'vitest'
import { mmPerPixel, SNAP_RADIUS_PX } from '../../../src/ui/viewport/screenScale'

describe('mmPerPixel', () => {
  it('gives the size of a pixel at a distance for a perspective camera', () => {
    expect(mmPerPixel({ kind: 'perspective', fovDeg: 50 }, 1000, 900)).toBeCloseTo(1.0363, 3)
  })

  it('grows with distance for a perspective camera', () => {
    const near = mmPerPixel({ kind: 'perspective', fovDeg: 40 }, 500, 800)
    const far = mmPerPixel({ kind: 'perspective', fovDeg: 40 }, 1000, 800)
    expect(far).toBeCloseTo(near * 2, 9)
  })

  it('ignores distance and follows zoom for an orthographic camera', () => {
    expect(mmPerPixel({ kind: 'ortho', heightMm: 900, zoom: 2 }, 123, 900)).toBeCloseTo(0.5, 9)
    expect(mmPerPixel({ kind: 'ortho', heightMm: 900, zoom: 2 }, 9999, 900)).toBeCloseTo(0.5, 9)
  })

  it('exports the ten pixel snap radius', () => {
    expect(SNAP_RADIUS_PX).toBe(10)
  })
})
