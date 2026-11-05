import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../../src/state/store'
import { resetStore, seam } from '../helpers/state'

const state = () => useStore.getState()

beforeEach(resetStore)

describe('theme', () => {
  it('starts dark and takes the chosen theme', () => {
    expect(state().theme).toBe('dark')
    state().setTheme('light')
    expect(state().theme).toBe('light')
  })

  it('is not undo history and adds no entry when set to the same theme', () => {
    const past = useStore.temporal.getState().pastStates.length
    state().setTheme('light')
    state().setTheme('light')
    expect(useStore.temporal.getState().pastStates.length).toBe(past)
  })
})

describe('view slice', () => {
  it('starts with solid parts and seams coloured by status', () => {
    expect([state().xray, state().colourBy]).toEqual([false, 'status'])
  })

  it('flips x-ray on each toggle', () => {
    state().toggleXray()
    expect(state().xray).toBe(true)
    state().toggleXray()
    expect(state().xray).toBe(false)
  })

  it('is not undo history, so undo does not undo a view change', () => {
    useStore.setState({ seams: [seam('a')] })
    state().toggleAccepted('a')
    const past = useStore.temporal.getState().pastStates.length
    state().toggleXray()
    state().setColourBy('access')
    expect(useStore.temporal.getState().pastStates.length).toBe(past)
    useStore.temporal.getState().undo()
    expect(state().xray).toBe(true)
    expect(state().colourBy).toBe('access')
  })
})
