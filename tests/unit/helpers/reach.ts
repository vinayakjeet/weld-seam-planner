import type { SeamAccess } from '../../../src/core/job/schema'
import type { SeamReach } from '../../../src/core/snake/reach'
import { useStore } from '../../../src/state/store'
import { samplePlan, SPRAY_ID } from './jobs'
import { partInfo } from './state'

export const SNAKE: SeamAccess = { clearanceDeg: 5, nearClearanceDeg: 5, class: 'snake', portId: null, reachCoverage: null, unreachable: [] }

export const reachOf = (coverage: number, unreachable: Array<[number, number]> = [], portId: string | null = 'P1'): SeamReach => ({
  portId,
  coverage,
  unreachable,
  stations: [
    { s: 0, ok: true, chain: { joints: [[0, 0, 0], [0, 0, -100], [0, 0, -250]] } },
    { s: 100, ok: false, chain: null },
  ],
})

// The t-joint sample as store state: seams accepted, spray procedure, one port, every seam classed snake.
export function loadSnakeSeams() {
  const plan = samplePlan('t-joint-merged')
  const seams = plan.seams.map((p) => p.seam)
  useStore.setState({
    part: partInfo({ ...plan.part, sourceUnits: 'mm' }),
    seams,
    statusById: Object.fromEntries(seams.map((s) => [s.id, 'accepted' as const])),
    procedureById: Object.fromEntries(seams.map((s) => [s.id, SPRAY_ID])),
  })
  useStore.getState().mergeAccess(Object.fromEntries(seams.map((s) => [s.id, { access: SNAKE, stations: [], points: s.points }])))
  useStore.getState().addPort([0, 0, 500], [0, 0, -1])
  return seams
}
