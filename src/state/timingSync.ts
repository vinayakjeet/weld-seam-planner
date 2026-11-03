import type { GeometryClient } from '../worker/client'
import { attempt, setNotice } from './flows'
import { selectPlan } from './selectors'
import { useStore } from './store'

export const TIMING_DEBOUNCE_MS = 150

// Works out the cycle time in the worker once the plan has been still for the delay. An answer for a plan that has
// changed since is dropped, so timingFor only ever names the current plan or an older one. Returns a stop function.
export function startTimingSync(client: GeometryClient, delayMs = TIMING_DEBOUNCE_MS): () => void {
  let request = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let last = selectPlan(useStore.getState())

  async function work(): Promise<void> {
    const plan = selectPlan(useStore.getState())
    const mine = ++request
    const outcome = await attempt(() => client.planTiming(plan))
    if (mine !== request || plan !== selectPlan(useStore.getState())) return
    if (outcome.status === 'error') {
      setNotice(outcome.error)
      return
    }
    useStore.getState().setTiming(plan, outcome.timing)
  }

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void work(), delayMs)
  }
  schedule()
  const unsubscribe = useStore.subscribe((state) => {
    const plan = selectPlan(state)
    if (plan === last) return
    last = plan
    schedule()
  })
  return () => {
    unsubscribe()
    clearTimeout(timer)
    request++
  }
}
