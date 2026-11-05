import { useStore } from './store'

export const FRAMES_PER_S = 30

// Steps a playing insertion one frame per tick and stops it at the last frame, whatever panel is open. The arm is drawn
// only on the Access step, so leaving the step pauses the playback rather than let it run on unseen. Returns a stop
// function.
export function startInsertionClock(): () => void {
  let timer: ReturnType<typeof setInterval> | undefined
  const sync = () => {
    const { insertionState, activeStep, setInsertionPlaying } = useStore.getState()
    const playing = insertionState?.playing === true
    if (playing && activeStep !== 'access') {
      setInsertionPlaying(false)
      return
    }
    if (playing && timer === undefined) {
      timer = setInterval(() => {
        const { insertionState: current, setInsertionFrame, setInsertionPlaying: setPlaying } = useStore.getState()
        if (!current) return
        if (current.frame >= current.frames.length - 1) setPlaying(false)
        else setInsertionFrame(current.frame + 1)
      }, 1000 / FRAMES_PER_S)
    } else if (!playing && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }
  const unsubscribe = useStore.subscribe(sync)
  sync()
  return () => {
    unsubscribe()
    clearInterval(timer)
    timer = undefined
  }
}
