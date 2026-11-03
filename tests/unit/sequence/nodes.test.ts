import { describe, expect, it } from 'vitest'
import { buildJob } from '../../../src/core/job/build'
import { reverseSeam } from '../../../src/core/seams/manual'
import { homePoint } from '../../../src/core/job/build'
import { nodesFromPlan } from '../../../src/core/sequence/nodes'
import { airLengthMm } from '../../../src/core/sequence/tsp'
import type { Visit } from '../../../src/core/sequence/types'
import { CREATED_AT, samplePlan } from '../helpers/jobs'
import { seededRandom } from '../helpers/random'

const exportedAirMm = (plan: ReturnType<typeof samplePlan>) =>
  buildJob(plan, { createdAt: CREATED_AT }).sequence.airMoves.reduce((total, m) => total + m.lengthMm, 0)

describe('nodesFromPlan', () => {
  it('has one node per seam in table order, with the lock flag from the set', () => {
    const plan = samplePlan('t-joint-merged')
    const nodes = nodesFromPlan(plan, new Set([plan.seams[1]!.seam.id]))
    expect(nodes.map((n) => n.id)).toEqual(plan.seams.map((p) => p.seam.id))
    expect(nodes.map((n) => n.locked)).toEqual([false, true])
  })

  it('table order air length equals the sum of the exported air moves', () => {
    const plan = samplePlan('t-joint-merged')
    const nodes = nodesFromPlan(plan, new Set())
    const tour: Visit[] = nodes.map((node) => ({ node, reversed: false }))
    expect(airLengthMm(tour, homePoint(plan), plan.settings.approachMm)).toBeCloseTo(exportedAirMm(plan), 2)
  })

  it('still matches the export when the seams are exported in another order', () => {
    const plan = samplePlan('double-bottom-cell')
    const nodes = nodesFromPlan(plan, new Set())
    const random = seededRandom(9)
    const order = plan.seams.map((_, i) => i).sort(() => random() - 0.5)
    const shuffled = { ...plan, seams: order.map((i) => plan.seams[i]!) }
    const tour: Visit[] = order.map((i) => ({ node: nodes[i]!, reversed: false }))
    expect(airLengthMm(tour, homePoint(plan), plan.settings.approachMm)).toBeCloseTo(exportedAirMm(shuffled), 1)
  })

  it('still matches the export when one seam is travelled the other way', () => {
    const plan = samplePlan('t-joint-merged')
    const nodes = nodesFromPlan(plan, new Set())
    const flipped = {
      ...plan,
      seams: plan.seams.map((p, i) => (i === 0 ? { ...p, seam: { ...reverseSeam(p.seam), id: p.seam.id, source: p.seam.source } } : p)),
    }
    const tour: Visit[] = nodes.map((node, i) => ({ node, reversed: i === 0 }))
    expect(airLengthMm(tour, homePoint(plan), plan.settings.approachMm)).toBeCloseTo(exportedAirMm(flipped), 2)
    // The two ways of travelling the seam really do differ.
    expect(nodes[0]!.enter.forward).not.toEqual(nodes[0]!.enter.reverse)
  })

  it('gives a closed loop the same entry and exit in both directions', () => {
    const plan = samplePlan('pipe-on-plate')
    const loop = nodesFromPlan(plan, new Set()).find((n) => n.closed)!
    expect(loop.enter.reverse).toEqual(loop.enter.forward)
    expect(loop.leave.reverse).toEqual(loop.leave.forward)
    expect(loop.arcStart.forward).toEqual(loop.arcEnd.forward)
  })

  it('has weld ends at the ends of the seam and a midpoint between them', () => {
    const plan = samplePlan('box-beam')
    const node = nodesFromPlan(plan, new Set())[0]!
    const { points } = plan.seams[0]!.seam
    expect(node.arcStart.forward).toEqual(expect.arrayContaining([expect.any(Number)]))
    expect(node.arcStart.forward[0]).toBeCloseTo(points[0]!.p[0], 2)
    expect(node.arcEnd.forward[0]).toBeCloseTo(points[points.length - 1]!.p[0], 2)
    expect(node.arcStart.reverse[0]).toBeCloseTo(points[points.length - 1]!.p[0], 2)
    expect(node.mid).toEqual(points[points.length >> 1]!.p)
  })
})
