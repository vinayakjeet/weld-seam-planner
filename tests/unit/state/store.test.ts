import { beforeEach, describe, expect, it } from 'vitest'
import { pointsFromPolyline } from '../../../src/core/seams/frames'
import { isManualError } from '../../../src/core/seams/manual'
import type { SeamCandidate } from '../../../src/core/seams/detect'
import { selectAllSeams } from '../../../src/state/selectors'
import { STEPS, useStore } from '../../../src/state/store'
import { corner, hollow, resetStore, seam } from '../helpers/state'

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

describe('status for a selection', () => {
  it('accepts every listed seam in one undo step', () => {
    state().setStatus(['a', 'b'], 'accepted')
    expect(state().statusById).toEqual({ a: 'accepted', b: 'accepted' })
    expect(temporal().pastStates).toHaveLength(1)
    temporal().undo()
    expect(state().statusById).toEqual({})
  })

  it('rejects the listed seams, replacing an earlier accept', () => {
    state().setStatus(['a'], 'accepted')
    state().setStatus(['a', 'c'], 'rejected')
    expect(state().statusById).toEqual({ a: 'rejected', c: 'rejected' })
  })

  it('skips unknown ids and adds no history entry when nothing changes', () => {
    state().setStatus(['ghost'], 'accepted')
    state().setStatus([], 'accepted')
    state().setStatus(['a'], 'accepted')
    state().setStatus(['a'], 'accepted')
    expect(temporal().pastStates).toHaveLength(1)
  })
})

describe('joint type for a selection', () => {
  it('sets the type of every listed seam in one undo step', () => {
    state().setTypes(['a', 'b'], 'lap')
    expect(state().typeById).toEqual({ a: 'lap', b: 'lap' })
    expect(temporal().pastStates).toHaveLength(1)
    temporal().undo()
    expect(state().typeById).toEqual({})
    temporal().redo()
    expect(state().typeById).toEqual({ a: 'lap', b: 'lap' })
  })

  it('drops the override of a seam whose detected type is the one asked for, and skips unknown ids', () => {
    state().setType('a', 'lap')
    state().setTypes(['a', 'b', 'ghost'], 'fillet')
    expect(state().typeById).toEqual({})
  })

  it('adds no history entry when nothing changes', () => {
    state().setTypes(['a', 'b'], 'fillet')
    state().setTypes([], 'lap')
    state().setTypes(['ghost'], 'lap')
    expect(temporal().pastStates).toHaveLength(0)
    state().setTypes(['a'], 'lap')
    state().setTypes(['a'], 'lap')
    expect(temporal().pastStates).toHaveLength(1)
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

describe('seams inside hollow sections in the store', () => {
  beforeEach(() => {
    useStore.setState({ seams: [seam('a', 0.9), hollow('h', 0.95), corner('c', 0.95)] })
  })

  it('keeps them hidden by default', () => {
    expect(state().showHollow).toBe(false)
  })

  it('never accepts them with accept all, even when they are shown', () => {
    state().setShowHollow(true)
    state().setShowCorners(true)
    state().acceptAbove(0.5)
    expect(state().statusById).toEqual({ a: 'accepted', c: 'accepted' })
  })

  it('lets the user accept one by hand once they are shown', () => {
    state().setShowHollow(true)
    state().toggleAccepted('h')
    expect(state().statusById).toEqual({ h: 'accepted' })
  })

  it('does not make the switch an undo step', () => {
    state().setShowHollow(true)
    state().setShowHollow(false)
    expect(temporal().pastStates).toHaveLength(0)
  })

  it('clears a selected or hovered hollow seam when they are hidden again, and keeps a visible one', () => {
    state().setShowHollow(true)
    state().select('h')
    state().hover('h')
    state().setShowHollow(false)
    expect(state().selectedId).toBeNull()
    expect(state().hoverId).toBeNull()
    state().setShowHollow(true)
    state().select('a')
    state().setShowHollow(false)
    expect(state().selectedId).toBe('a')
  })

  it('keeps corner candidates hidden when only hollow seams are shown', () => {
    state().setShowCorners(true)
    state().select('c')
    state().setShowHollow(true)
    state().setShowHollow(false)
    expect(state().selectedId).toBe('c')
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
    expect(ids()).toEqual(['a/a', 'a/b', 'b', 'c'])
    expect(state().supersededIds).toEqual(['a'])
    expect(state().manualSeams.map((s) => s.lengthMm)).toEqual([80, 120])
    expect(temporal().pastStates).toHaveLength(1)
    temporal().undo()
    expect(ids()).toEqual(['a', 'b', 'c'])
    expect(state().manualSeams).toEqual([])
    expect(state().supersededIds).toEqual([])
    temporal().redo()
    expect(ids()).toEqual(['a/a', 'a/b', 'b', 'c'])
  })

  it('opens a closed seam at the cut, so the user can split an all-around loop, and a second cut divides it', () => {
    const { points, lengthMm } = pointsFromPolyline([[0, 0, 0], [25.4, 0, 0], [25.4, 25.4, 0], [0, 25.4, 0]], true, () => [[0, 1, 0], [0, 0, 1]])
    useStore.setState({ seams: [seam('ring', 0.9, lengthMm, { points, closed: true, source: 'contact' })], statusById: { ring: 'accepted' } })
    expect(state().splitAt('ring', 30)).toBeNull()
    expect(selectAllSeams(state()).map((s) => [s.id, s.closed, Math.round(s.lengthMm * 10) / 10])).toEqual([['ring/o', false, 101.6]])
    expect(state().statusById['ring/o']).toBe('accepted')
    expect(state().splitAt('ring/o', 50.8)).toBeNull()
    expect(selectAllSeams(state()).map((s) => Math.round(s.lengthMm * 10) / 10)).toEqual([50.8, 50.8])
  })

  it('keeps an edited seam where it was: children of a detected seam take its row, later edits keep the row', () => {
    state().splitAt('b', 50)
    expect(ids()).toEqual(['a', 'b/a', 'b/b', 'c'])
    state().splitAt('b/a', 20)
    expect(ids()).toEqual(['a', 'b/a/a', 'b/a/b', 'b/b', 'c'])
    state().mergeSeamIds('b/a/b', 'b/b')
    expect(ids()).toEqual(['a', 'b/a/a', 'b/a/b+b/b', 'c'])
    state().reverse('c')
    expect(ids()).toEqual(['a', 'b/a/a', 'b/a/b+b/b', 'c~r'])
    state().trim('a', 5, 3)
    expect(ids()).toEqual(['a/t', 'b/a/a', 'b/a/b+b/b', 'c~r'])
  })

  it('merges two detected seams into the row of the first one', () => {
    state().mergeSeamIds('b', 'a')
    expect(ids()).toEqual(['b+a', 'c'])
  })

  it('keeps a drawn seam at the end and puts the children of a drawn seam where it was', () => {
    const first = state().addDrawn(lineSeam('x', 0, 100))
    const second = state().addDrawn(lineSeam('y', 0, 60))
    state().splitAt(first, 40)
    expect(ids()).toEqual(['a', 'b', 'c', `${first}/a`, `${first}/b`, second])
  })

  it('restores the row of an edited seam on undo and redo', () => {
    state().splitAt('b', 50)
    temporal().undo()
    expect(ids()).toEqual(['a', 'b', 'c'])
    temporal().redo()
    expect(ids()).toEqual(['a', 'b/a', 'b/b', 'c'])
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
    expect(ids()).toEqual(['a+b', 'c'])
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

  it('swaps an entered plate thickness with the plates when a seam is reversed', () => {
    useStore.setState({ thicknessById: { a: [6, 12] } })
    state().reverse('a')
    expect(state().thicknessById['a~r']).toEqual([12, 6])
    state().reverse('a~r')
    expect(state().thicknessById.a).toEqual([6, 12])
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
    expect(ids()).toEqual(['a/t', 'b', 'c'])
    expect(selectAllSeams(state()).find((s) => s.id === 'a/t')!.lengthMm).toBeCloseTo(192, 9)
    state().trim('a/t', 1, 1)
    expect(ids()).toEqual(['a/t/t', 'b', 'c'])
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

describe('setActiveStep', () => {
  it('clears the confirmation and the refused action notice of the step left behind', () => {
    const notice = { what: 'Nothing to merge.', why: 'One seam is selected.', next: 'Select two seams.' }
    useStore.getState().setActiveStep('access')
    useStore.getState().setInfo('Reach measured for 20 seams in 10.9 s.')
    useStore.getState().setNotice(notice)
    useStore.getState().setActiveStep('access')
    expect(useStore.getState().info).toBe('Reach measured for 20 seams in 10.9 s.')
    expect(useStore.getState().notice).toEqual(notice)
    useStore.getState().setActiveStep('sequence')
    expect(useStore.getState().info).toBeNull()
    expect(useStore.getState().notice).toBeNull()
  })
})
