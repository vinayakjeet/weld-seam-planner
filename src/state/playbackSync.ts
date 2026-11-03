import type { GeometryClient } from '../worker/client'
import { attempt, setNotice } from './flows'
import { selectPlan } from './selectors'
import { useStore, type AppState } from './store'

export const PLAYBACK_DEBOUNCE_MS = 250

// Steps that show the timeline, and so need the torch path.
const showsPlayback = (state: Pick<AppState, 'activeStep'>) => state.activeStep === 'sequence' || state.activeStep === 'export'

// Asks the worker for the torch path of the plan once it has been still for the delay, while a step that shows
// playback is open. An answer for a plan that changed since is dropped. Returns a stop function.
export function startPlaybackSync(client: GeometryClient, delayMs = PLAYBACK_DEBOUNCE_MS): () => void {
  let request = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let last: unknown = showsPlayback(useStore.getState()) ? selectPlan(useStore.getState()) : null

  async function work(): Promise<void> {
    const state = useStore.getState()
    if (!showsPlayback(state) || state.part === null) return
    const plan = selectPlan(state)
    if (state.playbackFor === plan) return
    const mine = ++request
    const outcome = await attempt(() => client.playbackPath(plan))
    if (mine !== request || plan !== selectPlan(useStore.getState())) return
    if (outcome.status === 'error') {
      setNotice(outcome.error)
      return
    }
    useStore.getState().setPlayback(plan, { path: outcome.path, timing: outcome.timing })
  }

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void work(), delayMs)
  }
  schedule()
  const unsubscribe = useStore.subscribe((state) => {
    const key = showsPlayback(state) ? selectPlan(state) : null
    if (key === last) return
    last = key
    if (key !== null) schedule()
  })
  return () => {
    unsubscribe()
    clearTimeout(timer)
    request++
  }
}
