import { describe, expect, it } from 'vitest'
import { createGeometryApi } from '../../../src/worker/geometry.api'
import { length, sub, type Vec3 } from '../../../src/core/math/vec3'
import { readSample } from '../helpers/samples'

const RADIUS_MM = 3
const NEAR_END: Vec3 = [-99.5, 5.3, 10.2]

async function loaded() {
  const api = createGeometryApi()
  const outcome = await api.loadStl(readSample('t-joint-merged'), 't.stl', () => {})
  expect(outcome.status).toBe('ready')
  return api
}

describe('geometry api: snapPreview', () => {
  it('returns null before any part is loaded', async () => {
    expect(await createGeometryApi().snapPreview(NEAR_END, RADIUS_MM)).toBeNull()
  })

  it('returns a point within the radius that equals the first point a drawn seam commits for the same click', async () => {
    const api = await loaded()
    const preview = await api.snapPreview(NEAR_END, RADIUS_MM)
    expect(preview).not.toBeNull()
    expect(length(sub(preview!, NEAR_END))).toBeLessThanOrEqual(RADIUS_MM)

    const drawn = await api.snapDraw([{ p: NEAR_END }, { p: [99.5, 5.2, 9.8] }], RADIUS_MM)
    expect(drawn.status).toBe('ok')
    if (drawn.status !== 'ok') return
    expect(preview).toEqual(drawn.seam.points[0]!.p)
  })

  it('returns null when no feature edge is within the radius', async () => {
    const api = await loaded()
    expect(await api.snapPreview([0, 40, 30], RADIUS_MM)).toBeNull()
  })

  it('returns null for a zero radius, as a drawn seam would not snap either', async () => {
    const api = await loaded()
    expect(await api.snapPreview(NEAR_END, 0)).toBeNull()
  })
})
