import { beforeEach, describe, expect, it } from 'vitest'
import { STEPS, useStore } from '../../../src/state/store'
import { resetStore, seam } from '../helpers/state'

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
