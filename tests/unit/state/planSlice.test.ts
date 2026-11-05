import { beforeEach, describe, expect, it } from 'vitest'
import { buildJob } from '../../../src/core/job/build'
import { importJob } from '../../../src/core/job/importJob'
import { WPS_PRESETS } from '../../../src/core/process/wps'
import type { Procedure } from '../../../src/core/job/schema'
import { pointsFromPolyline } from '../../../src/core/seams/frames'
import type { SeamCandidate } from '../../../src/core/seams/detect'
import { selectAllSeams, selectPlan } from '../../../src/state/selectors'
import { useStore } from '../../../src/state/store'
import { CREATED_AT, samplePlan, SPRAY_ID } from '../helpers/jobs'
import { partInfo, resetStore, seam } from '../helpers/state'

const state = () => useStore.getState()
const temporal = () => useStore.temporal.getState()
const text = (e: { what: string; why: string; next: string } | null) => (e ? `${e.what} ${e.why} ${e.next}` : '')

const lineSeam = (id: string, from: number, to: number): SeamCandidate => {
  const { points, lengthMm } = pointsFromPolyline([[from, 0, 0], [to, 0, 0]], false, () => [[0, 1, 0], [0, 0, 1]])
  return seam(id, 0.8, lengthMm, { points })
}

const SPRAY = WPS_PRESETS.find((p) => p.id === SPRAY_ID)!
const PULSE = 'WPS-GMAW-PULSE'

function mine(overrides: Partial<Procedure> = {}): Procedure {
  return { ...structuredClone(SPRAY), id: 'WPS-MINE', name: 'Mine', ...overrides }
}

beforeEach(() => {
  resetStore()
  useStore.setState({ seams: [lineSeam('a', 0, 200), lineSeam('b', 200, 300), lineSeam('c', 400, 500), lineSeam('d', 600, 700)] })
})

describe('the procedure library', () => {
  it('starts with the five presets and empty assignment maps', () => {
    expect(state().procedures.map((p) => p.id)).toEqual(WPS_PRESETS.map((p) => p.id))
    expect(state().procedures).toHaveLength(5)
    expect(state().procedureById).toEqual({})
    expect(state().overridesById).toEqual({})
    expect(state().legById).toEqual({})
    expect(state().thicknessById).toEqual({})
  })

  it('adds a procedure as one undo step', () => {
    expect(state().addProcedure(mine())).toBeNull()
    expect(state().procedures.map((p) => p.id)).toContain('WPS-MINE')
    expect(temporal().pastStates).toHaveLength(1)
    temporal().undo()
    expect(state().procedures).toHaveLength(5)
  })

  it('refuses a taken id, naming the id, and changes nothing', () => {
    const before = state().procedures
    const refusal = state().addProcedure(mine({ id: SPRAY_ID }))
    expect(text(refusal)).toContain(SPRAY_ID)
    expect(refusal!.what.length).toBeGreaterThan(0)
    expect(refusal!.why.length).toBeGreaterThan(0)
    expect(refusal!.next.length).toBeGreaterThan(0)
    expect(state().procedures).toBe(before)
    expect(temporal().pastStates).toHaveLength(0)
  })

  it('refuses zero travel speed, an empty name and a non positive current, naming each field', () => {
    const before = state().procedures
    expect(text(state().addProcedure(mine({ travelSpeedMmS: 0 })))).toContain('travelSpeedMmS')
    expect(text(state().addProcedure(mine({ name: '   ' })))).toContain('name')
    expect(text(state().addProcedure(mine({ electrical: { ...SPRAY.electrical, currentA: -5 } })))).toContain('currentA')
    expect(text(state().addProcedure(mine({ electrical: { ...SPRAY.electrical, wireFeedMpm: 0 } })))).toContain('wireFeedMpm')
    expect(state().procedures).toBe(before)
    expect(temporal().pastStates).toHaveLength(0)
  })

  it('updates a procedure in place', () => {
    expect(state().updateProcedure(SPRAY_ID, { ...SPRAY, travelSpeedMmS: 8 })).toBeNull()
    expect(state().procedures.find((p) => p.id === SPRAY_ID)!.travelSpeedMmS).toBe(8)
    expect(state().procedures.map((p) => p.id)).toEqual(WPS_PRESETS.map((p) => p.id))
    expect(temporal().pastStates).toHaveLength(1)
  })

  it('refuses an update that is invalid, unknown or takes another procedure id', () => {
    const before = state().procedures
    expect(text(state().updateProcedure(SPRAY_ID, { ...SPRAY, travelSpeedMmS: 0 }))).toContain('travelSpeedMmS')
    expect(state().updateProcedure('WPS-NOPE', mine())).not.toBeNull()
    expect(text(state().updateProcedure(SPRAY_ID, { ...SPRAY, id: PULSE }))).toContain(PULSE)
    expect(state().procedures).toBe(before)
    expect(temporal().pastStates).toHaveLength(0)
  })

  it('moves the seams of a renamed procedure to the new id in one undo step, and back on undo', () => {
    state().assignProcedure(['a', 'b'], SPRAY_ID)
    state().setOverride(['a'], { electrical: { currentA: 300 } })
    const steps = temporal().pastStates.length
    expect(state().updateProcedure(SPRAY_ID, { ...SPRAY, id: 'WPS-RENAMED' })).toBeNull()
    expect(temporal().pastStates).toHaveLength(steps + 1)
    expect(state().procedureById).toEqual({ a: 'WPS-RENAMED', b: 'WPS-RENAMED' })
    expect(state().procedures.some((p) => p.id === SPRAY_ID)).toBe(false)
    temporal().undo()
    expect(state().procedureById).toEqual({ a: SPRAY_ID, b: SPRAY_ID })
    expect(state().procedures.some((p) => p.id === SPRAY_ID)).toBe(true)
    expect(state().overridesById).toEqual({ a: { electrical: { currentA: 300 } } })
  })

  it('refuses to delete a procedure that seams use, saying how many, and deletes an unused one', () => {
    state().assignProcedure(['a', 'b', 'c'], SPRAY_ID)
    const refusal = state().deleteProcedure(SPRAY_ID)
    expect(refusal!.what).toBe(`${SPRAY_ID} is used by 3 seams.`)
    expect(refusal!.why.length).toBeGreaterThan(0)
    expect(refusal!.next.length).toBeGreaterThan(0)
    expect(state().procedures).toHaveLength(5)

    expect(state().deleteProcedure(PULSE)).toBeNull()
    expect(state().procedures.some((p) => p.id === PULSE)).toBe(false)
    temporal().undo()
    expect(state().procedures.some((p) => p.id === PULSE)).toBe(true)
  })

  it('says "1 seam" for a single user', () => {
    state().assignProcedure(['a'], SPRAY_ID)
    expect(state().deleteProcedure(SPRAY_ID)!.what).toBe(`${SPRAY_ID} is used by 1 seam.`)
  })
})

describe('assigning, overriding, leg and thickness', () => {
  it('assigns one procedure to many seams in a single undo step and clears with null', () => {
    expect(state().assignProcedure(['a', 'b', 'c'], SPRAY_ID)).toBeNull()
    expect(state().procedureById).toEqual({ a: SPRAY_ID, b: SPRAY_ID, c: SPRAY_ID })
    expect(temporal().pastStates).toHaveLength(1)
    expect(state().assignProcedure(['b'], null)).toBeNull()
    expect(state().procedureById).toEqual({ a: SPRAY_ID, c: SPRAY_ID })
    temporal().undo()
    expect(state().procedureById).toEqual({ a: SPRAY_ID, b: SPRAY_ID, c: SPRAY_ID })
  })

  it('refuses a procedure that is not in the library', () => {
    expect(text(state().assignProcedure(['a'], 'WPS-NOPE'))).toContain('WPS-NOPE')
    expect(state().procedureById).toEqual({})
  })

  it('adds no history step when nothing changes', () => {
    state().assignProcedure(['a'], SPRAY_ID)
    state().assignProcedure(['a'], SPRAY_ID)
    state().assignProcedure(['b'], null)
    expect(temporal().pastStates).toHaveLength(1)
  })

  it('sets an override on many seams as one step and merges nested keys', () => {
    state().assignProcedure(['a', 'b'], SPRAY_ID)
    state().setOverride(['a', 'b'], { electrical: { currentA: 300 } })
    state().setOverride(['a'], { electrical: { voltageV: 29 }, travelSpeedMmS: 8 })
    expect(state().overridesById).toEqual({
      a: { electrical: { currentA: 300, voltageV: 29 }, travelSpeedMmS: 8 },
      b: { electrical: { currentA: 300 } },
    })
    expect(temporal().pastStates).toHaveLength(3)
  })

  it('removes the key again when the new value equals the procedure value, and drops empty entries', () => {
    state().assignProcedure(['a'], SPRAY_ID)
    state().setOverride(['a'], { electrical: { currentA: 300 } })
    state().setOverride(['a'], { electrical: { currentA: SPRAY.electrical.currentA } })
    expect(state().overridesById).toEqual({})
  })

  it('compares against each seam own procedure', () => {
    state().assignProcedure(['a'], SPRAY_ID)
    state().assignProcedure(['b'], PULSE)
    const pulseCurrent = state().procedures.find((p) => p.id === PULSE)!.electrical.currentA
    state().setOverride(['a', 'b'], { electrical: { currentA: pulseCurrent } })
    expect(state().overridesById).toEqual({ a: { electrical: { currentA: pulseCurrent } } })
  })

  it('refuses an override that is not a valid value, naming the field', () => {
    state().assignProcedure(['a'], SPRAY_ID)
    expect(text(state().setOverride(['a'], { travelSpeedMmS: 0 }))).toContain('travelSpeedMmS')
    expect(state().overridesById).toEqual({})
  })

  it('clears the overrides of the chosen seams only', () => {
    state().assignProcedure(['a', 'b'], SPRAY_ID)
    state().setOverride(['a', 'b'], { travelSpeedMmS: 8 })
    expect(state().clearOverrides(['a'])).toBeNull()
    expect(state().overridesById).toEqual({ b: { travelSpeedMmS: 8 } })
    temporal().undo()
    expect(Object.keys(state().overridesById)).toEqual(['a', 'b'])
  })

  it('rounds a leg to 0.1 mm, clears it with null and refuses a non positive one', () => {
    expect(state().setLeg(['a', 'b'], 6.04)).toBeNull()
    expect(state().legById).toEqual({ a: 6, b: 6 })
    state().setLeg(['a'], 6.06)
    expect(state().legById.a).toBe(6.1)
    state().setLeg(['b'], null)
    expect(state().legById).toEqual({ a: 6.1 })
    expect(text(state().setLeg(['a'], 0))).toContain('leg')
    expect(text(state().setLeg(['a'], Number.NaN))).toContain('leg')
    expect(state().legById).toEqual({ a: 6.1 })
  })

  it('rounds a thickness edit to 0.01 mm, accepts a null side, and clears with null', () => {
    expect(state().setThickness('a', [12.004, null])).toBeNull()
    expect(state().thicknessById).toEqual({ a: [12, null] })
    state().setThickness('a', [12.006, 8])
    expect(state().thicknessById.a).toEqual([12.01, 8])
    state().setThickness('a', null)
    expect(state().thicknessById).toEqual({})
    expect(text(state().setThickness('a', [0, 8]))).toContain('thickness')
    expect(state().thicknessById).toEqual({})
  })

  it('every action is one undo step and undo restores the previous maps by reference', () => {
    const actions: Array<() => unknown> = [
      () => state().assignProcedure(['a'], SPRAY_ID),
      () => state().setOverride(['a'], { travelSpeedMmS: 8 }),
      () => state().setLeg(['a'], 7),
      () => state().setThickness('a', [10, 10]),
      () => state().clearOverrides(['a']),
    ]
    for (const action of actions) {
      const before = { p: state().procedureById, o: state().overridesById, l: state().legById, t: state().thicknessById, steps: temporal().pastStates.length }
      action()
      expect(temporal().pastStates).toHaveLength(before.steps + 1)
      temporal().undo()
      expect(state().procedureById).toBe(before.p)
      expect(state().overridesById).toBe(before.o)
      expect(state().legById).toBe(before.l)
      expect(state().thicknessById).toBe(before.t)
      temporal().redo()
    }
  })

  it('does not put selection or hover into history', () => {
    state().select('a')
    state().select('b', 'toggle')
    state().hover('a')
    expect(temporal().pastStates).toHaveLength(0)
  })
})

describe('edits that replace a seam', () => {
  beforeEach(() => {
    state().toggleAccepted('a')
    state().assignProcedure(['a'], SPRAY_ID)
    state().setOverride(['a'], { travelSpeedMmS: 8 })
    state().setLeg(['a'], 7)
    state().setThickness('a', [10, 12])
  })

  it('gives both children of a split the procedure, overrides, leg and thickness, and undo restores the parent', () => {
    expect(state().splitAt('a', 80)).toBeNull()
    for (const id of ['a/a', 'a/b']) {
      expect(state().procedureById[id]).toBe(SPRAY_ID)
      expect(state().overridesById[id]).toEqual({ travelSpeedMmS: 8 })
      expect(state().legById[id]).toBe(7)
      expect(state().thicknessById[id]).toEqual([10, 12])
    }
    expect(state().procedureById.a).toBeUndefined()
    expect(state().legById.a).toBeUndefined()
    temporal().undo()
    expect(state().procedureById).toEqual({ a: SPRAY_ID })
    expect(state().overridesById).toEqual({ a: { travelSpeedMmS: 8 } })
    expect(state().legById).toEqual({ a: 7 })
    expect(state().thicknessById).toEqual({ a: [10, 12] })
  })

  it('lets a merge take the values of the first parent', () => {
    state().assignProcedure(['b'], PULSE)
    expect(state().mergeSeamIds('a', 'b')).toBeNull()
    expect(state().procedureById).toEqual({ 'a+b': SPRAY_ID })
    expect(state().legById).toEqual({ 'a+b': 7 })
  })

  it('drops the values of a deleted manual seam', () => {
    const id = state().addDrawn(lineSeam('x', 0, 50))
    state().assignProcedure([id], SPRAY_ID)
    state().setLeg([id], 5)
    state().remove(id)
    expect(state().procedureById[id]).toBeUndefined()
    expect(state().legById[id]).toBeUndefined()
  })
})

describe('multi-select', () => {
  it('replaces by default and keeps selectedId as the clicked seam', () => {
    state().select('a')
    state().select('c')
    expect(state().selectedIds).toEqual(['c'])
    expect(state().selectedId).toBe('c')
    state().select(null)
    expect(state().selectedIds).toEqual([])
    expect(state().selectedId).toBeNull()
  })

  it('toggles a seam in and out; selectedId is the last one clicked on', () => {
    state().select('a')
    state().select('c', 'toggle')
    expect(state().selectedIds).toEqual(['a', 'c'])
    expect(state().selectedId).toBe('c')
    state().select('c', 'toggle')
    expect(state().selectedIds).toEqual(['a'])
    expect(state().selectedId).toBe('a')
    state().select('a', 'toggle')
    expect(state().selectedIds).toEqual([])
    expect(state().selectedId).toBeNull()
  })

  it('selects the range between the anchor and the click in visible table order', () => {
    state().select('b')
    state().select('d', 'range')
    expect(state().selectedIds).toEqual(['b', 'c', 'd'])
    expect(state().selectedId).toBe('d')
    state().select('a', 'range')
    expect(state().selectedIds).toEqual(['a', 'b'])
  })

  it('follows the visible order: hidden corner candidates are not in a range', () => {
    useStore.setState({ seams: [seam('a'), { ...seam('h'), hidden: true }, seam('b')] })
    state().select('a')
    state().select('b', 'range')
    expect(state().selectedIds).toEqual(['a', 'b'])
    state().setShowCorners(true)
    state().select('a')
    state().select('b', 'range')
    expect(state().selectedIds).toEqual(['a', 'h', 'b'])
  })

  it('treats a range with no anchor as a plain click', () => {
    state().select('c', 'range')
    expect(state().selectedIds).toEqual(['c'])
  })

  it('does not rewrite the selection when it is unchanged', () => {
    state().select('a')
    let notified = 0
    const stop = useStore.subscribe(() => notified++)
    state().select('a')
    stop()
    expect(notified).toBe(0)
  })

  it('moves the selection onto the children of a split seam', () => {
    state().select('a')
    state().select('b', 'toggle')
    state().splitAt('b', 40)
    expect(state().selectedIds).toEqual(['a', 'b/a'])
    expect(state().selectedId).toBe('b/a')
  })
})

describe('applyImportedPlan', () => {
  it('restores a job from double-bottom-cell exactly and leaves no undo history', () => {
    const source = samplePlan('double-bottom-cell')
    const job = buildJob(source, { createdAt: CREATED_AT }, [])
    const imported = importJob(JSON.stringify(job), source.part.sha256)
    if (imported.status !== 'ok') throw new Error(JSON.stringify(imported.error))

    state().toggleAccepted('a')
    state().assignProcedure(['a'], SPRAY_ID)
    expect(temporal().pastStates.length).toBeGreaterThan(0)

    const { sourceUnits, ...rest } = source.part
    useStore.setState({ part: partInfo({ ...rest, sourceUnits: sourceUnits === 'unknown' ? 'mm' : sourceUnits }) })
    state().applyImportedPlan(imported.plan)

    expect(temporal().pastStates).toHaveLength(0)
    expect(temporal().futureStates).toHaveLength(0)
    const rebuilt = buildJob(selectPlan(state()), { createdAt: CREATED_AT }, [])
    expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(job))
    expect(selectAllSeams(state()).map((s) => s.id)).toEqual(expect.arrayContaining(source.seams.map((p) => p.seam.id)))
  })

  it('keeps drawn seam numbering clear of imported ids', () => {
    const source = samplePlan('t-joint-merged', (plan) => ({
      ...plan,
      seams: plan.seams.map((p, i) => (i === 0 ? { ...p, seam: { ...p.seam, id: 'drawn-7', label: 'D7' } } : p)),
    }))
    const job = buildJob(source, { createdAt: CREATED_AT }, [])
    const imported = importJob(JSON.stringify(job), source.part.sha256)
    if (imported.status !== 'ok') throw new Error('import failed')
    state().applyImportedPlan(imported.plan)
    expect(state().nextDrawnId).toBe(8)
  })

  it('keeps an arm and a port from a hand-edited file inside the limits the Access fields allow', () => {
    const source = samplePlan('t-joint-merged')
    const plan = {
      ...source,
      access: {
        ports: [{ id: 'P1', position: [0, 0, 500] as [number, number, number], direction: [0, 0, -1] as [number, number, number], diameterMm: 9000 }],
        arm: { ...source.access.arm, links: 1, maxBendDeg: 90 },
      },
    }
    state().applyImportedPlan(plan)
    expect(state().arm).toMatchObject({ links: 2, maxBendDeg: 45 })
    expect(state().ports[0]!.diameterMm).toBe(2000)
  })
})

describe('job settings', () => {
  it('starts at the defaults and reaches the plan', () => {
    expect(state().jobSettings).toEqual({ poseSpacingMm: 5, airSpeedMmS: 250, approachMm: 50, cleanEveryS: 0, cleanTimeS: 30 })
    expect(selectPlan(state()).settings).toMatchObject({ poseSpacingMm: 5, airSpeedMmS: 250, approachMm: 50 })
  })

  it('gives a new plan object when a setting changes', () => {
    const before = selectPlan(state())
    useStore.setState({ jobSettings: { poseSpacingMm: 8, airSpeedMmS: 250, approachMm: 50, cleanEveryS: 0, cleanTimeS: 30 } })
    expect(selectPlan(state())).not.toBe(before)
    expect(selectPlan(state()).settings.poseSpacingMm).toBe(8)
  })
})

describe('torch cleaning setting', () => {
  it('sets the interval and the stop time, reaches the plan and undoes in one step', () => {
    expect(state().setCleaning({ cleanEveryS: 1800, cleanTimeS: 45 })).toBeNull()
    expect(state().jobSettings).toMatchObject({ cleanEveryS: 1800, cleanTimeS: 45 })
    expect(selectPlan(state()).settings).toMatchObject({ cleanEveryS: 1800, cleanTimeS: 45 })
    expect(temporal().pastStates).toHaveLength(1)
    temporal().undo()
    expect(state().jobSettings).toMatchObject({ cleanEveryS: 0, cleanTimeS: 30 })
    temporal().redo()
    expect(state().jobSettings.cleanEveryS).toBe(1800)
  })

  it('changes only the field that is given and keeps the other settings', () => {
    state().setCleaning({ cleanEveryS: 600 })
    expect(state().jobSettings).toEqual({ poseSpacingMm: 5, airSpeedMmS: 250, approachMm: 50, cleanEveryS: 600, cleanTimeS: 30 })
  })

  it('adds no history entry when nothing changes', () => {
    state().setCleaning({ cleanEveryS: 0, cleanTimeS: 30 })
    state().setCleaning({})
    expect(temporal().pastStates).toHaveLength(0)
  })

  it('refuses a negative, infinite or absurd value, and says what to enter', () => {
    for (const patch of [{ cleanEveryS: -1 }, { cleanTimeS: Number.NaN }, { cleanEveryS: Infinity }, { cleanTimeS: -5 }, { cleanEveryS: 1e7 }, { cleanTimeS: 1e5 }]) {
      const problem = state().setCleaning(patch)
      expect(text(problem), JSON.stringify(patch)).toMatch(/cleaning/i)
      expect(problem!.next.length).toBeGreaterThan(10)
    }
    expect(state().jobSettings).toMatchObject({ cleanEveryS: 0, cleanTimeS: 30 })
    expect(temporal().pastStates).toHaveLength(0)
  })

  it('comes from an imported plan', () => {
    state().setCleaning({ cleanEveryS: 900, cleanTimeS: 20 })
    const plan = { ...selectPlan(state()), settings: { ...selectPlan(state()).settings, cleanEveryS: 1200, cleanTimeS: 40 } }
    state().applyImportedPlan(plan)
    expect(state().jobSettings).toMatchObject({ cleanEveryS: 1200, cleanTimeS: 40 })
  })
})
