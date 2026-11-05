import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../../../src/core/math/vec3'
import { chainJacobian, chainResidual, type ChainModel } from '../../../src/core/snake/fabrik'
import { seededRandom } from '../helpers/random'

describe('chainJacobian', () => {
  it('matches central differences of the residual for random bends, depths and directions', () => {
    const random = seededRandom(11)
    for (let trial = 0; trial < 40; trial++) {
      const n = 2 + Math.floor(random() * 12)
      const axis = (() => {
        const v: Vec3 = [random() - 0.5, random() - 0.5, random() - 0.5]
        const l = Math.hypot(...v)
        return v.map((c) => c / l) as Vec3
      })()
      const model: ChainModel = {
        port: [random() * 100, random() * 100, random() * 100],
        axis,
        linkMm: 150,
        links: n,
        wrist: [random() * 1000, random() * 1000, random() * 1000],
        toolZ: [0, 0, 1],
      }
      const x = [random() * 500, ...Array.from({ length: 2 * n }, () => (random() - 0.5) * 0.6)]
      if (trial === 0) for (let k = 1; k < x.length; k++) x[k] = 0
      const analytic = chainJacobian(model, x)
      for (let j = 0; j < x.length; j++) {
        const h = j === 0 ? 1e-3 : 1e-6
        const up = [...x]
        const down = [...x]
        up[j] = up[j]! + h
        down[j] = down[j]! - h
        const ru = chainResidual(model, up)
        const rd = chainResidual(model, down)
        for (let i = 0; i < 6; i++) {
          const numeric = (ru[i]! - rd[i]!) / (2 * h)
          expect(Math.abs(analytic[i]![j]! - numeric), `trial ${trial} row ${i} column ${j}`).toBeLessThan(1e-4 * (1 + Math.abs(numeric)))
        }
      }
    }
  })
})
