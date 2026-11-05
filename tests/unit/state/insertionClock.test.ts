import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FRAMES_PER_S, startInsertionClock } from '../../../src/state/insertionClock'
import { useStore } from '../../../src/state/store'
import { resetStore } from '../helpers/state'

const state = () => useStore.getState()
const frames = Array.from({ length: 5 }, (_, k) => ({ tipS: k * 10, joints: [[0, 0, 0], [0, 0, -10 * (k + 1)]] as Array<[number, number, number]> }))

describe('startInsertionClock', () => {
  let stop: () => void
  beforeEach(() => {
    vi.useFakeTimers()
    resetStore()
    state().setActiveStep('access')
    stop = startInsertionClock()
  })
  afterEach(() => {
    stop()
    vi.useRealTimers()
  })

  it('steps a playing insertion one frame per tick and stops at the last frame, with no panel mounted', () => {
    state().setInsertion({ seamId: 'a', frames, frame: 0, playing: true })
    vi.advanceTimersByTime(1000 / FRAMES_PER_S + 1)
    expect(state().insertionState?.frame).toBe(1)
    vi.advanceTimersByTime(10 * (1000 / FRAMES_PER_S))
    expect(state().insertionState).toMatchObject({ frame: 4, playing: false })
  })

  it('pauses when the Access step is left, where the arm is not drawn', () => {
    state().setInsertion({ seamId: 'a', frames, frame: 0, playing: true })
    vi.advanceTimersByTime(1000 / FRAMES_PER_S + 1)
    state().setActiveStep('sequence')
    expect(state().insertionState).toMatchObject({ frame: 1, playing: false })
    vi.advanceTimersByTime(1000)
    expect(state().insertionState?.frame).toBe(1)
  })

  it('does nothing after it is stopped', () => {
    stop()
    state().setInsertion({ seamId: 'a', frames, frame: 0, playing: true })
    vi.advanceTimersByTime(1000)
    expect(state().insertionState?.frame).toBe(0)
  })
})
