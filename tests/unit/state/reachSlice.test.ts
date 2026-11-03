import { beforeEach, describe, expect, it } from 'vitest'
import { reachKey } from '../../../src/core/snake/reach'
import { reachFor } from '../../../src/state/reachSlice'
import { useStore } from '../../../src/state/store'
import { resetStore, seam } from '../helpers/state'
import { reachOf } from '../helpers/reach'

const state = () => useStore.getState()

function store(id: string, points = seam(id).points) {
  state().mergeReach({ [id]: { ...reachOf(0.7), points, key: reachKey(state().ports, state().arm) } })
  return points
}

beforeEach(resetStore)

describe('reach slice', () => {
  it('starts empty, idle and without an insertion', () => {
    expect(state().reachById).toEqual({})
    expect(state().reachBusy).toBe(false)
    expect(state().reachProgress).toBeNull()
    expect(state().insertionState).toBeNull()
    expect(reachFor(state(), seam('a'))).toBeNull()
  })

  it('returns the answer for the same points, ports and arm', () => {
    const a = seam('a')
    store('a', a.points)
    expect(reachFor(state(), a)?.coverage).toBe(0.7)
  })

  it('ignores the answer once the seam points are replaced', () => {
    const a = seam('a')
    store('a', a.points)
    expect(reachFor(state(), { ...a, points: [...a.points] })).toBeNull()
  })

  it('ignores the answer after a port moves by 1 mm or any arm field changes', () => {
    const a = seam('a')
    state().addPort([0, 0, 500], [0, 0, -1])
    store('a', a.points)
    state().movePort('P1', [1, 0, 500])
    expect(reachFor(state(), a)).toBeNull()
    store('a', a.points)
    expect(reachFor(state(), a)).not.toBeNull()
    state().setArm({ maxBendDeg: 25 })
    expect(reachFor(state(), a)).toBeNull()
  })

  it('keeps the other answers when it merges, replacing the maps instead of mutating them', () => {
    store('a')
    const before = state().reachById
    store('b')
    expect(Object.keys(state().reachById)).toEqual(['a', 'b'])
    expect(state().reachById).not.toBe(before)
  })

  it('clears every answer and the insertion', () => {
    store('a')
    state().setInsertion({ seamId: 'a', frames: [{ tipS: 0, joints: [[0, 0, 0], [0, 0, -10]] }], frame: 0, playing: false })
    state().clearReach()
    expect(state().reachById).toEqual({})
    expect(state().insertionState).toBeNull()
  })

  it('does not add undo steps', () => {
    store('a')
    state().setReachBusy(true)
    expect(useStore.temporal.getState().pastStates).toHaveLength(0)
  })
})

describe('insertion state', () => {
  const frames = [0, 10, 20].map((tipS) => ({ tipS, joints: [[0, 0, 0], [0, 0, -tipS]] as [number, number, number][] }))
  const start = () => state().setInsertion({ seamId: 'a', frames, frame: 0, playing: false })

  it('moves by frame and clamps to the first and last frame', () => {
    start()
    state().setInsertionFrame(2)
    expect(state().insertionState?.frame).toBe(2)
    state().setInsertionFrame(9)
    expect(state().insertionState?.frame).toBe(2)
    state().setInsertionFrame(-3)
    expect(state().insertionState?.frame).toBe(0)
  })

  it('restarts from the first frame when play is pressed at the last frame', () => {
    start()
    state().setInsertionFrame(2)
    state().setInsertionPlaying(true)
    expect(state().insertionState).toMatchObject({ frame: 0, playing: true })
    state().setInsertionPlaying(false)
    expect(state().insertionState?.playing).toBe(false)
  })

  it('does nothing without an insertion', () => {
    state().setInsertionFrame(1)
    state().setInsertionPlaying(true)
    expect(state().insertionState).toBeNull()
  })
})
