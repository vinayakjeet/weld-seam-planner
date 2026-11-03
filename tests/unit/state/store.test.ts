import { beforeEach, describe, expect, it } from 'vitest'
import { pointsFromPolyline } from '../../../src/core/seams/frames'
import { isManualError } from '../../../src/core/seams/manual'
import type { SeamCandidate } from '../../../src/core/seams/detect'
import { selectAllSeams } from '../../../src/state/selectors'
import { STEPS, useStore } from '../../../src/state/store'
import { corner, resetStore, seam } from '../helpers/state'

const temporal = () => useStore.temporal.getState()
const state = () => useStore.getState()

beforeEach(() => {
  resetStore()
  useStore.setState({ seams: [seam('a', 0.9), seam('b', 0.7), seam('c', 0.5)] })
})

describe('store basics', () => {
  it('keeps the steps and starts on import', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['import', 'seams', 'procedures', 'access', 'sequence', 'export'])
    expect(state().activeStep).toBe('import')
    state().setActiveStep('seams')
    expect(state().activeStep).toBe('seams')
  })
})

describe('accepting seams', () => {
  it('accepts a candidate, undoes it and redoes it', () => {
    state().toggleAccepted('a')
    expect(state().statusById).toEqual({ a: 'accepted' })
    temporal().undo()
    expect(state().statusById).toEqual({})
    temporal().redo()
    expect(state().statusById).toEqual({ a: 'accepted' })
  })

  it('returns an accepted seam to candidate by removing its status', () => {
    state().toggleAccepted('a')
    state().toggleAccepted('a')
    expect(state().statusById).toEqual({})
    expect(temporal().pastStates).toHaveLength(2)
  })

  it('ignores an id that is not among the current seams', () => {
    state().toggleAccepted('ghost')
    expect(state().statusById).toEqual({})
    expect(temporal().pastStates).toHaveLength(0)
  })

  it('accepts everything at or above the threshold in one undo step', () => {
    state().acceptAbove(0.7)
    expect(state().statusById).toEqual({ a: 'accepted', b: 'accepted' })
    expect(temporal().pastStates).toHaveLength(1)
    temporal().undo()
    expect(state().statusById).toEqual({})
  })

  it('adds no history entry when acceptAbove has nothing to change', () => {
    state().acceptAbove(0.95)
    expect(temporal().pastStates).toHaveLength(0)
    state().acceptAbove(0.7)
    state().acceptAbove(0.7)
    expect(temporal().pastStates).toHaveLength(1)
  })

  it('undo restores only the status map, not the seams or the selection', () => {
    state().toggleAccepted('a')
    state().select('b')
    temporal().undo()
    expect(state().seams.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(state().selectedId).toBe('b')
  })

  it('keeps at most 100 undo steps', () => {
    for (let i = 0; i < 105; i++) state().toggleAccepted('a')
    expect(temporal().pastStates).toHaveLength(100)
  })
})

describe('joint type overrides', () => {
  it('sets an override, undoes it and redoes it', () => {
    state().setType('a', 'lap')
    expect(state().typeById).toEqual({ a: 'lap' })
    temporal().undo()
    expect(state().typeById).toEqual({})
    temporal().redo()
    expect(state().typeById).toEqual({ a: 'lap' })
  })

  it('replaces an earlier override', () => {
    state().setType('a', 'lap')
    state().setType('a', 'saddle')
    expect(state().typeById).toEqual({ a: 'saddle' })
    expect(temporal().pastStates).toHaveLength(2)
  })

  it('clears an override with null and when set back to the computed type', () => {
    state().setType('a', 'lap')
    state().setType('a', null)
    expect(state().typeById).toEqual({})
    state().setType('a', 'lap')
    state().setType('a', 'fillet')
    expect(state().typeById).toEqual({})
  })

  it('adds no history entry for a type that is already in force', () => {
    state().setType('a', 'fillet')
    state().setType('a', null)
    expect(temporal().pastStates).toHaveLength(0)
    state().setType('a', 'lap')
    state().setType('a', 'lap')
    expect(temporal().pastStates).toHaveLength(1)
  })

  it('ignores an id that is not among the current seams', () => {
    state().setType('ghost', 'lap')
    expect(state().typeById).toEqual({})
    expect(temporal().pastStates).toHaveLength(0)
  })

  it('undoes acceptance and type together as separate steps, each restoring both maps as they were', () => {
    state().toggleAccepted('a')
    state().setType('a', 'lap')
    temporal().undo()
    expect(state().typeById).toEqual({})
    expect(state().statusById).toEqual({ a: 'accepted' })
    temporal().undo()
    expect(state().statusById).toEqual({})
  })
})

describe('corner candidates in the store', () => {
  beforeEach(() => {
    useStore.setState({ seams: [seam('a', 0.9), corner('c', 0.95), seam('b', 0.7)] })
  })

  it('keeps them hidden by default', () => {
    expect(state().showCorners).toBe(false)
  })

  it('leaves them out of accept all until they are shown', () => {
    state().acceptAbove(0.5)
    expect(state().statusById).toEqual({ a: 'accepted', b: 'accepted' })
    state().setShowCorners(true)
    state().acceptAbove(0.5)
    expect(state().statusById).toEqual({ a: 'accepted', b: 'accepted', c: 'accepted' })
  })

  it('does not make the switch an undo step', () => {
    state().setShowCorners(true)
    state().setShowCorners(false)
    expect(temporal().pastStates).toHaveLength(0)
  })

  it('clears a selected or hovered corner when corners are hidden again', () => {
    state().setShowCorners(true)
    state().select('c')
    state().hover('c')
    state().setShowCorners(false)
    expect(state().selectedId).toBeNull()
    expect(state().hoverId).toBeNull()
  })

  it('keeps the selection of a visible seam when corners are hidden', () => {
    state().setShowCorners(true)
    state().select('a')
    state().setShowCorners(false)
    expect(state().selectedId).toBe('a')
  })
})

describe('changes that are not undoable', () => {
  it('hover, select, detection settings and the busy flag add no history entries', () => {
    state().hover('a')
    state().hover(null)
    state().select('b')
    state().select(null)
    state().setDetectSettings({ creaseAngleDeg: 45 })
    useStore.setState({ detectBusy: true })
    expect(temporal().pastStates).toHaveLength(0)
    expect(state().detectSettings.creaseAngleDeg).toBe(45)
  })

  it('does not rewrite hoverId when it already has that value', () => {
    state().hover('a')
    let notified = 0
    const stop = useStore.subscribe(() => notified++)
    state().hover('a')
    stop()
    expect(notified).toBe(0)
  })
})

describe('manual seam operations', () => {
  const lineSeam = (id: string, from: number, to: number): SeamCandidate => {
    const { points, lengthMm } = pointsFromPolyline([[from, 0, 0], [to, 0, 0]], false, () => [[0, 1, 0], [0, 0, 1]])
    return seam(id, 0.8, lengthMm, { points })
  }
  const ids = () => selectAllSeams(state()).map((s) => s.id)

  beforeEach(() => {
    useStore.setState({ seams: [lineSeam('a', 0, 200), lineSeam('b', 200, 300), lineSeam('c', 400, 500)] })
  })

  it('splits a detected seam: the parent is superseded, the children are manual, all in one undo step', () => {
    expect(state().splitAt('a', 80)).toBeNull()
    expect(ids()).toEqual(['b', 'c', 'a/a', 'a/b'])
    expect(state().supersededIds).toEqual(['a'])
    expect(state().manualSeams.map((s) => s.lengthMm)).toEqual([80, 120])
    expect(temporal().pastStates).toHaveLength(1)
    temporal().undo()
    expect(ids()).toEqual(['a', 'b', 'c'])
    expect(state().manualSeams).toEqual([])
    expect(state().supersededIds).toEqual([])
    temporal().redo()
    expect(ids()).toEqual(['b', 'c', 'a/a', 'a/b'])
  })

  it('makes every operation exactly one undo step and restores the three maps exactly on undo and redo', () => {
    state().toggleAccepted('a')
    state().toggleAccepted('b')
    const operations: Array<() => unknown> = [
      () => state().splitAt('a', 80),
      () => state().mergeSeamIds('b', 'a/b'),
      () => state().reverse('c'),
      () => state().trim('c~r', 5, 3),
      () => state().addDrawn(lineSeam('x', 0, 50)),
    ]
    for (const operation of operations) {
      const before = { manual: state().manualSeams, superseded: state().supersededIds, status: state().statusById, steps: temporal().pastStates.length }
      expect(operation()).not.toBeInstanceOf(Object)
      expect(temporal().pastStates).toHaveLength(before.steps + 1)
      const after = { manual: state().manualSeams, superseded: state().supersededIds, status: state().statusById }
      temporal().undo()
      expect(state().manualSeams).toBe(before.manual)
      expect(state().supersededIds).toBe(before.superseded)
      expect(state().statusById).toBe(before.status)
      temporal().redo()
      expect(state().manualSeams).toBe(after.manual)
      expect(state().supersededIds).toBe(after.superseded)
      expect(state().statusById).toBe(after.status)
    }
  })

  it('gives the children the accepted status of an accepted parent and drops the parent entry', () => {
    state().toggleAccepted('a')
    state().splitAt('a', 80)
    expect(state().statusById).toEqual({ 'a/a': 'accepted', 'a/b': 'accepted' })
    temporal().undo()
    expect(state().statusById).toEqual({ a: 'accepted' })
  })

  it('lets a merged seam inherit accepted when any parent was accepted, and rejected when only a rejection exists', () => {
    state().toggleAccepted('b')
    state().mergeSeamIds('a', 'b')
    expect(state().statusById).toEqual({ 'a+b': 'accepted' })
    expect(ids()).toEqual(['c', 'a+b'])
    expect(state().supersededIds).toEqual(['a', 'b'])

    useStore.setState({ statusById: { ...state().statusById, c: 'rejected' } })
    state().reverse('c')
    expect(state().statusById).toEqual({ 'c~r': 'rejected', 'a+b': 'accepted' })
  })

  it('merges seams that touch and refuses ones that do not, leaving state and history alone', () => {
    const error = state().mergeSeamIds('a', 'c')
    expect(isManualError(error)).toBe(true)
    expect(state().manualSeams).toEqual([])
    expect(temporal().pastStates).toHaveLength(0)
    expect(state().mergeSeamIds('a', 'b')).toBeNull()
  })

  it('reverses twice back to the original geometry, still one visible seam', () => {
    state().reverse('a')
    state().reverse('a~r')
    expect(ids().filter((id) => id.startsWith('a'))).toEqual(['a'])
    const back = selectAllSeams(state()).find((s) => s.id === 'a')!
    expect(back.source).toBe('manual')
    expect(back.points[0]!.p).toEqual([0, 0, 0])
    expect(back.points[0]!.t).toEqual([1, 0, 0])
  })

  it('trims a manual seam in place of the one it came from', () => {
    state().trim('a', 5, 3)
    expect(ids()).toEqual(['b', 'c', 'a/t'])
    expect(selectAllSeams(state()).find((s) => s.id === 'a/t')!.lengthMm).toBeCloseTo(192, 9)
    state().trim('a/t', 1, 1)
    expect(ids()).toEqual(['b', 'c', 'a/t/t'])
    expect(state().manualSeams).toHaveLength(1)
  })

  it('carries the joint type in force onto the children and clears the parent override', () => {
    state().setType('a', 'lap')
    state().splitAt('a', 80)
    expect(state().typeById).toEqual({})
    expect(state().manualSeams.map((s) => s.jointType)).toEqual(['lap', 'lap'])
  })

  it('moves the selection to the first child when the selected seam is replaced', () => {
    state().select('a')
    state().hover('a')
    state().splitAt('a', 80)
    expect(state().selectedId).toBe('a/a')
    expect(state().hoverId).toBeNull()
    state().select('c')
    state().splitAt('a/b', 50)
    expect(state().selectedId).toBe('c')
  })

  it('returns a readable error for an unknown seam or a bad request and changes nothing', () => {
    for (const result of [state().splitAt('ghost', 10), state().splitAt('a', 1), state().trim('a', 150, 60), state().reverse('ghost'), state().mergeSeamIds('a', 'ghost')]) {
      expect(isManualError(result)).toBe(true)
      for (const part of [result!.what, result!.why, result!.next]) expect(part.trim().length).toBeGreaterThan(0)
    }
    expect(temporal().pastStates).toHaveLength(0)
    expect(state().manualSeams).toEqual([])
  })

  it('adds drawn seams as accepted, numbered D1, D2, and keeps the numbers after undo', () => {
    const first = state().addDrawn(lineSeam('x', 0, 50))
    const second = state().addDrawn(lineSeam('x', 0, 60))
    expect([first, second]).toEqual(['drawn-1', 'drawn-2'])
    expect(state().manualSeams.map((s) => s.label)).toEqual(['D1', 'D2'])
    expect(state().statusById).toEqual({ 'drawn-1': 'accepted', 'drawn-2': 'accepted' })
    expect(state().selectedId).toBe('drawn-2')
    temporal().undo()
    expect(ids()).toEqual(['a', 'b', 'c', 'drawn-1'])
    expect(state().addDrawn(lineSeam('x', 0, 70))).toBe('drawn-3')
  })

  it('rejects removing a detected seam and deletes a manual one, with its status', () => {
    const refused = state().remove('a')
    expect(isManualError(refused)).toBe(true)
    expect(ids()).toEqual(['a', 'b', 'c'])
    expect(temporal().pastStates).toHaveLength(0)

    const drawn = state().addDrawn(lineSeam('x', 0, 50))
    expect(state().remove(drawn)).toBeNull()
    expect(ids()).toEqual(['a', 'b', 'c'])
    expect(state().statusById).toEqual({})
    expect(state().selectedId).toBeNull()
    temporal().undo()
    expect(ids()).toContain(drawn)
    expect(state().statusById).toEqual({ [drawn]: 'accepted' })
  })

  it('adds no history for selection or hover after an edit', () => {
    state().splitAt('a', 80)
    const steps = temporal().pastStates.length
    state().select('b')
    state().hover('c')
    expect(temporal().pastStates).toHaveLength(steps)
  })

  it('accepts, types and finds manual seams like detected ones', () => {
    state().splitAt('a', 80)
    state().toggleAccepted('a/b')
    expect(state().statusById).toEqual({ 'a/b': 'accepted' })
    state().setType('a/a', 'corner')
    expect(state().typeById).toEqual({ 'a/a': 'corner' })
    state().acceptAbove(0.5)
    expect(state().statusById).toMatchObject({ 'a/a': 'accepted', 'a/b': 'accepted', b: 'accepted', c: 'accepted' })
    expect(state().statusById).not.toHaveProperty('a')
  })
})
