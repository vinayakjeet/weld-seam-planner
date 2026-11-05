import { beforeEach, describe, expect, it } from 'vitest'
import { buildJob } from '../../../src/core/job/build'
import { reachKey } from '../../../src/core/snake/reach'
import { selectAllSeams, selectPlan, selectStats, visibleSeams } from '../../../src/state/selectors'
import { useStore } from '../../../src/state/store'
import { CREATED_AT } from '../helpers/jobs'
import { loadSnakeSeams, reachOf, SNAKE } from '../helpers/reach'
import { corner, partInfo, resetStore, seam } from '../helpers/state'

describe('selectStats', () => {
  it('is all zeros with no part and no seams', () => {
    expect(selectStats({ part: null, seams: [], statusById: {}, showCorners: false })).toEqual({
      triangles: 0,
      bodies: 0,
      accepted: 0,
      candidates: 0,
      acceptedLengthMm: 0,
      hiddenAccepted: 0,
    })
  })

  it('counts candidates and sums the accepted weld length', () => {
    const seams = [seam('a', 0.9, 200), seam('b', 0.9, 200), seam('c', 0.5, 35)]
    const part = partInfo({ triangles: 1234, bodies: 3 })
    expect(selectStats({ part, seams, statusById: {}, showCorners: false })).toMatchObject({ triangles: 1234, bodies: 3, accepted: 0, candidates: 3 })
    const accepted = selectStats({ part, seams, statusById: { a: 'accepted', b: 'accepted' }, showCorners: false })
    expect(accepted).toMatchObject({ accepted: 2, candidates: 1, acceptedLengthMm: 400 })
  })

  it('counts rejected seams as neither accepted nor candidate', () => {
    const stats = selectStats({ part: null, seams: [seam('a'), seam('b')], statusById: { a: 'rejected' }, showCorners: false })
    expect(stats).toMatchObject({ accepted: 0, candidates: 1, acceptedLengthMm: 0 })
  })

  it('counts accepted ids that are absent from the current seams as hidden, not as accepted', () => {
    const stats = selectStats({
      part: null,
      seams: [seam('b', 0.9, 100)],
      statusById: { a: 'accepted', b: 'accepted', z: 'rejected' },
      showCorners: false,
    })
    expect(stats).toMatchObject({ accepted: 1, hiddenAccepted: 1, acceptedLengthMm: 100 })
  })
})

describe('visibleSeams', () => {
  const seams = [seam('a'), corner('c'), seam('b')]

  it('leaves out hidden corner candidates by default', () => {
    expect(visibleSeams(seams, false).map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('lists them, in order, once corners are shown', () => {
    expect(visibleSeams(seams, true).map((s) => s.id)).toEqual(['a', 'c', 'b'])
  })

  it('returns the same array when nothing is hidden', () => {
    const all = [seam('a'), seam('b')]
    expect(visibleSeams(all, false)).toBe(all)
  })
})

describe('selectStats with corner candidates', () => {
  const seams = [seam('a', 0.9, 200), corner('c', 0.9, 100)]

  it('leaves hidden corners out of the candidate count', () => {
    expect(selectStats({ part: null, seams, statusById: {}, showCorners: false })).toMatchObject({ candidates: 1, accepted: 0 })
  })

  it('counts them once they are shown', () => {
    const stats = selectStats({ part: null, seams, statusById: { c: 'accepted' }, showCorners: true })
    expect(stats).toMatchObject({ candidates: 1, accepted: 1, acceptedLengthMm: 100 })
  })

  it('does not count an accepted corner while it is hidden, and does not call it hidden by the angle', () => {
    const stats = selectStats({ part: null, seams, statusById: { c: 'accepted' }, showCorners: false })
    expect(stats).toMatchObject({ accepted: 0, acceptedLengthMm: 0, hiddenAccepted: 0 })
  })
})

describe('selectAllSeams', () => {
  it('lists detected seams that are not superseded, then the manual ones', () => {
    const seams = [seam('a'), seam('b'), seam('c')]
    const manualSeams = [seam('m1'), seam('m2')]
    expect(selectAllSeams({ seams, manualSeams, supersededIds: ['b'] }).map((s) => s.id)).toEqual(['a', 'c', 'm1', 'm2'])
  })

  it('returns the detection result itself when nothing was edited', () => {
    const seams = [seam('a'), seam('b')]
    expect(selectAllSeams({ seams, manualSeams: [], supersededIds: [] })).toBe(seams)
  })
})

describe('selectStats with manual seams', () => {
  it('counts manual seams, sums their accepted length and does not call a superseded accepted id hidden', () => {
    const stats = selectStats({
      part: null,
      seams: [seam('a', 0.9, 200), seam('b', 0.9, 100)],
      manualSeams: [seam('a/a', 1, 80), seam('a/b', 1, 120)],
      supersededIds: ['a'],
      statusById: { 'a/a': 'accepted', 'a/b': 'accepted', a: 'accepted' },
      showCorners: false,
    })
    expect(stats).toMatchObject({ accepted: 2, candidates: 1, acceptedLengthMm: 200, hiddenAccepted: 0 })
  })
})

describe('selectPlan', () => {
  const load = () => {
    resetStore()
    useStore.setState({
      part: partInfo(),
      seams: [seam('a'), seam('b'), corner('h'), seam('c'), seam('d')],
      manualSeams: [seam('m', 0.9, 50, { source: 'manual' })],
      supersededIds: ['d'],
      statusById: { a: 'accepted', b: 'rejected', h: 'accepted', c: 'accepted', m: 'accepted', d: 'accepted' },
    })
  }

  it('holds only accepted, visible, non-superseded seams in table order', () => {
    load()
    expect(selectPlan(useStore.getState()).seams.map((p) => p.seam.id)).toEqual(['a', 'c', 'm'])
    useStore.setState({ showCorners: true })
    expect(selectPlan(useStore.getState()).seams.map((p) => p.seam.id)).toEqual(['a', 'h', 'c', 'm'])
  })

  it('applies the type and thickness edits and carries procedure, overrides and leg', () => {
    load()
    useStore.setState({
      typeById: { a: 'lap' },
      thicknessById: { a: [9, null] },
      procedureById: { a: 'WPS-GTAW' },
      overridesById: { a: { travelSpeedMmS: 4 } },
      legById: { a: 4.5 },
    })
    const [first, second] = selectPlan(useStore.getState()).seams
    expect(first!.seam.jointType).toBe('lap')
    expect(first!.seam.thicknessMm).toEqual([9, null])
    expect(first).toMatchObject({ procedureId: 'WPS-GTAW', overrides: { travelSpeedMmS: 4 }, legMm: 4.5, access: null })
    expect(second).toMatchObject({ procedureId: null, overrides: {}, legMm: null })
    expect(second!.seam.jointType).toBe('fillet')
  })

  it('uses the part, gravity, procedures and the crease angle of the detection settings', () => {
    load()
    useStore.setState({ detectSettings: { creaseAngleDeg: 41 }, gravity: [1, 0, 0] })
    const plan = selectPlan(useStore.getState())
    expect(plan.part).toBe(useStore.getState().part)
    expect(plan.gravity).toEqual([1, 0, 0])
    expect(plan.procedures).toBe(useStore.getState().procedures)
    expect(plan.settings).toEqual({ poseSpacingMm: 5, airSpeedMmS: 250, approachMm: 50, creaseAngleDeg: 41, cleanEveryS: 0, cleanTimeS: 30 })
  })

  it('returns the same object for the same state and after a hover or selection change', () => {
    load()
    const first = selectPlan(useStore.getState())
    expect(selectPlan(useStore.getState())).toBe(first)
    useStore.getState().hover('a')
    useStore.getState().select('c')
    expect(selectPlan(useStore.getState())).toBe(first)
    useStore.getState().setLeg(['a'], 5)
    expect(selectPlan(useStore.getState())).not.toBe(first)
  })

  it('has no seams and unknown units before a part is loaded', () => {
    resetStore()
    const plan = selectPlan(useStore.getState())
    expect(plan.seams).toEqual([])
    expect(plan.part.sourceUnits).toBe('unknown')
  })
})

describe('selectPlan with a reach result', () => {
  const merge = (ids: string[], coverage = 0.6, unreachable: Array<[number, number]> = [[10, 20]]) => {
    const { seams } = useStore.getState()
    useStore.getState().mergeReach(
      Object.fromEntries(
        ids.map((id) => [id, { ...reachOf(coverage, unreachable), points: seams.find((s) => s.id === id)!.points, key: reachKey(useStore.getState().ports, useStore.getState().arm) }]),
      ),
    )
  }
  const accessOf = (id: string) => selectPlan(useStore.getState()).seams.find((p) => p.seam.id === id)!.access

  beforeEach(resetStore)

  it('merges the port, coverage and stretches of a current reach into the plan access and the built job', () => {
    const [first] = loadSnakeSeams()
    merge([first!.id])
    expect(accessOf(first!.id)).toMatchObject({ class: 'snake', portId: 'P1', reachCoverage: 0.6, unreachable: [[10, 20]] })
    const job = buildJob(selectPlan(useStore.getState()), { createdAt: CREATED_AT }, [])
    expect(job.seams.find((s) => s.id === first!.id)!.access).toMatchObject({ portId: 'P1', reachCoverage: 0.6 })
  })

  it('falls back to the plain access after a port moves by 1 mm', () => {
    const [first] = loadSnakeSeams()
    merge([first!.id])
    useStore.getState().movePort('P1', [1, 0, 500])
    expect(accessOf(first!.id)).toMatchObject({ portId: null, reachCoverage: null, unreachable: [] })
  })

  it('falls back to the plain access after any arm field changes', () => {
    const [first] = loadSnakeSeams()
    merge([first!.id])
    useStore.getState().setArm({ maxBendDeg: 25 })
    expect(accessOf(first!.id)).toMatchObject({ portId: null, reachCoverage: null })
  })

  it('falls back to the plain access when the seam points are replaced', () => {
    const [first] = loadSnakeSeams()
    merge([first!.id])
    useStore.setState((s) => ({ seams: s.seams.map((x) => (x.id === first!.id ? { ...x, points: [...x.points] } : x)) }))
    useStore.getState().mergeAccess({ [first!.id]: { access: SNAKE, stations: [], points: useStore.getState().seams[0]!.points } })
    expect(accessOf(first!.id)).toMatchObject({ portId: null, reachCoverage: null })
  })

  it('leaves a seam that is not classed snake untouched', () => {
    const [first] = loadSnakeSeams()
    useStore.getState().mergeAccess({ [first!.id]: { access: { ...SNAKE, class: 'standard' }, stations: [], points: first!.points } })
    merge([first!.id])
    expect(accessOf(first!.id)).toMatchObject({ class: 'standard', portId: null, reachCoverage: null })
  })
})
