import { beforeEach, describe, expect, it } from 'vitest'
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
    expect(STEPS.map((s) => s.id)).toEqual(['import', 'seams', 'procedures', 'sequence', 'export'])
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
