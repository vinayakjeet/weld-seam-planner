import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ARM } from '../../../src/core/snake/arm'
import { pointsFromPolyline } from '../../../src/core/seams/frames'
import { offerSummary, parseSaved, savedKey, snapshotOf } from '../../../src/state/savedPlan'
import { useStore } from '../../../src/state/store'
import { partInfo, resetStore, seam } from '../helpers/state'

const NOW = '2026-11-04T10:15:00.000Z'

function editedState() {
  const { points, lengthMm } = pointsFromPolyline([[0, 0, 0], [100, 0, 0]], false, () => [[0, 0, 1], [0, -1, 0]])
  useStore.setState({
    part: partInfo(),
    manualSeams: [seam('drawn-1', 0.9, lengthMm, { points, source: 'manual', thicknessMm: [10, null] })],
    supersededIds: ['a'],
    statusById: { 'drawn-1': 'accepted', b: 'rejected' },
    typeById: { b: 'lap' },
    nextDrawnId: 2,
    procedureById: { 'drawn-1': 'WPS-GMAW-SPRAY-FW6' },
    overridesById: { 'drawn-1': { electrical: { currentA: 250 } } },
    legById: { 'drawn-1': 5 },
    thicknessById: { 'drawn-1': [10, 12] },
    gravity: [1, 0, 0],
    detectSettings: { creaseAngleDeg: 33 },
    jobSettings: { poseSpacingMm: 8, airSpeedMmS: 300, approachMm: 70 },
  })
  return useStore.getState()
}

beforeEach(resetStore)

const SEQUENCE = {
  strategy: 'manual' as const,
  order: [
    { seamId: 'b', reversed: true, locked: true },
    { seamId: 'a', reversed: false, locked: false },
  ],
}

describe('savedKey', () => {
  it('is weld-plan: followed by the hash', () => {
    expect(savedKey('abc')).toBe('weld-plan:abc')
  })
})

describe('snapshotOf and parseSaved', () => {
  it('round trips every saved field through JSON', () => {
    const snapshot = snapshotOf(editedState(), NOW)
    const parsed = parseSaved(JSON.parse(JSON.stringify(snapshot)))
    if (parsed.status !== 'ok') throw new Error(JSON.stringify(parsed.error))
    expect(parsed.saved).toEqual(snapshot)
    expect(snapshot).toMatchObject({ version: 1, savedAt: NOW, partName: 'a.stl', sha256: 'a'.repeat(64), nextDrawnId: 2, gravity: [1, 0, 0] })
  })

  it('reads a save without ports or arm as no ports and the default arm', () => {
    const snapshot = JSON.parse(JSON.stringify(snapshotOf(editedState(), NOW)))
    delete snapshot.ports
    delete snapshot.arm
    const parsed = parseSaved(snapshot)
    if (parsed.status !== 'ok') throw new Error(JSON.stringify(parsed.error))
    expect(parsed.saved.ports).toEqual([])
    expect(parsed.saved.arm).toEqual(DEFAULT_ARM)
  })

  it('round trips ports and a changed arm', () => {
    editedState()
    useStore.getState().addPort([1200, 500, 1000], [0, 0, -1])
    useStore.getState().setArm({ maxBendDeg: 25 })
    const snapshot = snapshotOf(useStore.getState(), NOW)
    const parsed = parseSaved(JSON.parse(JSON.stringify(snapshot)))
    if (parsed.status !== 'ok') throw new Error(JSON.stringify(parsed.error))
    expect(parsed.saved.ports).toEqual([{ id: 'P1', position: [1200, 500, 1000], direction: [0, 0, -1], diameterMm: 600 }])
    expect(parsed.saved.arm.maxBendDeg).toBe(25)
  })

  it('has nothing to save without a part', () => {
    expect(() => snapshotOf(useStore.getState(), NOW)).toThrow(/part/)
  })

  it('refuses a version 2 entry and says which version it is', () => {
    const parsed = parseSaved({ ...snapshotOf(editedState(), NOW), version: 2 })
    expect(parsed.status).toBe('error')
    if (parsed.status === 'error') {
      expect(parsed.error.what).toContain('version 2')
      for (const part of Object.values(parsed.error)) expect(part.trim().length).toBeGreaterThan(0)
    }
  })

  it.each([
    ['a string', 'nonsense'],
    ['null', null],
    ['an object with no fields', { version: 1 }],
  ])('refuses %s as corrupt', (_name, value) => {
    const parsed = parseSaved(value)
    expect(parsed.status).toBe('error')
    if (parsed.status === 'error') expect(parsed.error.what).toMatch(/saved plan/i)
  })

  it('checks the shape of the points of a manual seam', () => {
    const snapshot = JSON.parse(JSON.stringify(snapshotOf(editedState(), NOW)))
    snapshot.manualSeams[0].points[0].p = [1, 2]
    expect(parseSaved(snapshot).status).toBe('error')
    const noNormals = JSON.parse(JSON.stringify(snapshotOf(editedState(), NOW)))
    delete noNormals.manualSeams[0].points[0].n1
    expect(parseSaved(noNormals).status).toBe('error')
  })

  it('keeps the table row a manual seam took over through a save and a read', () => {
    const state = editedState()
    useStore.setState({ manualSeams: state.manualSeams.map((m) => ({ ...m, slot: 'a' })) })
    const parsed = parseSaved(JSON.parse(JSON.stringify(snapshotOf(useStore.getState(), NOW))))
    expect(parsed.status).toBe('ok')
    if (parsed.status === 'ok') expect(parsed.saved.manualSeams[0]!.slot).toBe('a')
  })

  it('refuses a status that is neither accepted nor rejected', () => {
    const snapshot = JSON.parse(JSON.stringify(snapshotOf(editedState(), NOW)))
    snapshot.statusById.b = 'maybe'
    expect(parseSaved(snapshot).status).toBe('error')
  })
})

describe('offerSummary', () => {
  it('counts accepted seams and the distinct procedures they use', () => {
    useStore.setState({
      part: partInfo(),
      statusById: { a: 'accepted', b: 'accepted', c: 'rejected' },
      procedureById: { a: 'P1', b: 'P1', c: 'P2' },
    })
    expect(offerSummary(snapshotOf(useStore.getState(), NOW))).toEqual({ acceptedSeams: 2, proceduresInUse: 1 })
  })
})

describe('the sequence in a saved plan', () => {
  it('stores the strategy, the order, the reversed flags and the locks', () => {
    useStore.setState({ ...SEQUENCE })
    const snapshot = JSON.parse(JSON.stringify(snapshotOf(editedState(), NOW)))
    const parsed = parseSaved(snapshot)
    expect(parsed.status).toBe('ok')
    if (parsed.status === 'ok') expect(parsed.saved).toMatchObject(SEQUENCE)
  })

  it('reads an entry saved before the sequence was stored as table order', () => {
    const older = JSON.parse(JSON.stringify(snapshotOf(editedState(), NOW)))
    delete older.strategy
    delete older.order
    const parsed = parseSaved(older)
    expect(parsed.status).toBe('ok')
    if (parsed.status === 'ok') expect(parsed.saved).toMatchObject({ strategy: 'table-order', order: [] })
  })

  it('refuses an order entry with a missing seam id', () => {
    const snapshot = JSON.parse(JSON.stringify(snapshotOf(editedState(), NOW)))
    snapshot.order = [{ reversed: false, locked: false }]
    expect(parseSaved(snapshot).status).toBe('error')
  })
})
