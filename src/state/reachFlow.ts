import type { SeamCandidate } from '../core/seams/detect'
import { reachKey } from '../core/snake/reach'
import { DEFAULT_TORCH } from '../core/torch/frames'
import type { GeometryClient } from '../worker/client'
import { accessFor } from './accessSlice'
import { attempt, setNotice } from './flows'
import { reachFor, stationAt } from './reachSlice'
import { runTimeText } from './runTime'
import { selectPlan } from './selectors'
import { useStore, type AppState } from './store'

// Each run takes a number; only the newest run (and a cancel before it) may change the state.
let reachRequest = 0

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// The selected seams if any accepted seam is selected, otherwise every accepted seam the access check classed snake.
export function reachTargets(state: AppState): SeamCandidate[] {
  const seams = selectPlan(state).seams.map((planned) => planned.seam)
  const chosen = new Set(state.selectedIds)
  const selected = seams.filter((seam) => chosen.has(seam.id))
  if (selected.length > 0) return selected
  return seams.filter((seam) => accessFor(state, seam)?.class === 'snake')
}

// The accepted seams with a result measured under other ports or another arm than the current ones.
export function staleReachSeams(state: AppState): SeamCandidate[] {
  const now = reachKey(state.ports, state.arm)
  return selectPlan(state)
    .seams.map((planned) => planned.seam)
    .filter((seam) => seam.id in state.reachKeyById && state.reachKeyById[seam.id] !== now)
}

// Measures again only the seams whose result is out of date, whatever is selected.
export async function runStaleReach(client: GeometryClient): Promise<void> {
  const stale = staleReachSeams(useStore.getState())
  if (stale.length > 0) await runReach(client, stale)
}

// Measured one seam per worker call, so each result is kept as it comes; Cancel also stops the seam in flight.
export async function runReach(client: GeometryClient, only?: SeamCandidate[]): Promise<void> {
  const state = useStore.getState()
  if (state.ports.length === 0) {
    setNotice({
      what: 'Reach was not run because there is no port.',
      why: 'The snake arm enters the part through a port, and none has been placed.',
      next: 'Choose Add port and click the part where the opening is, then run reach again.',
    })
    return
  }
  const targets = only ?? reachTargets(state)
  if (targets.length === 0) {
    setNotice({
      what: 'Reach was not run because there are no snake seams to measure.',
      why: 'The arm is only needed for seams the access check classes as snake, and none of the accepted seams has that class.',
      next: 'Accept the seams you want to weld and wait for the Acc column to fill, or select the seams to measure, then run reach again.',
    })
    return
  }
  setNotice(null)
  const mine = ++reachRequest
  const { ports, arm } = state
  const key = reachKey(ports, arm)
  const started = performance.now()
  const store = useStore.getState()
  store.setReachBusy(true)
  store.setReachProgress({ done: 0, total: targets.length })

  for (let i = 0; i < targets.length; i++) {
    const seam = targets[i]!
    const outcome = await attempt(() => client.reach([seam], ports, arm, () => {}))
    if (mine !== reachRequest || outcome.status === 'cancelled') return
    const now = useStore.getState()
    if (outcome.status === 'error') {
      now.setReachBusy(false)
      now.setReachProgress(null)
      setNotice(outcome.error)
      return
    }
    const result = outcome.results[seam.id]
    if (result) now.mergeReach({ [seam.id]: { ...result, points: seam.points, key } })
    now.setReachProgress({ done: i + 1, total: targets.length })
    if (reachKey(now.ports, now.arm) !== key && i + 1 < targets.length) {
      now.setReachBusy(false)
      now.setReachProgress(null)
      now.setInfo(`Reach stopped after ${i + 1} of ${plural(targets.length, 'seam')} because the ports or the arm changed. Run reach again to measure with the new values.`)
      return
    }
  }
  const done = useStore.getState()
  done.setReachBusy(false)
  done.setReachProgress(null)
  done.setInfo(`Reach measured for ${plural(targets.length, 'seam')} in ${runTimeText(performance.now() - started)}.`)
}

// Stops the run, the seam in flight at its next station. Seams already measured keep their result.
export function cancelReach(client: GeometryClient): void {
  const state = useStore.getState()
  if (!state.reachBusy) return
  reachRequest++
  void client.cancelReach()
  const progress = state.reachProgress
  state.setReachBusy(false)
  state.setReachProgress(null)
  state.setInfo(
    progress
      ? `Reach cancelled after ${progress.done} of ${plural(progress.total, 'seam')}. The seams already measured keep their result.`
      : 'Reach cancelled.',
  )
}

const noReach = {
  what: 'The arm was not inserted because the selected seam has no current reach result.',
  why: 'The insertion starts from a chain that reach found, and a result goes out of date when the seam, a port or the arm changes.',
  next: 'Select a snake seam, choose Run reach, then choose Insert again.',
}

// The arm entering through the reach port to the station nearest the scrub position of the selected seam.
export async function insertSelected(client: GeometryClient): Promise<void> {
  const state = useStore.getState()
  const seam = selectPlan(state).seams.find((planned) => planned.seam.id === state.selectedId)?.seam
  const reach = seam ? reachFor(state, seam) : null
  const port = reach ? state.ports.find((p) => p.id === reach.portId) : undefined
  const station = reach ? stationAt(reach, state.scrubS) : null
  if (!seam || !reach || !port || !station) {
    setNotice(noReach)
    return
  }
  setNotice(null)
  const outcome = await attempt(() => client.insertion(seam, station.s, port, state.arm, DEFAULT_TORCH.approachMm))
  const now = useStore.getState()
  // The seam may have been deselected while the worker worked.
  if (now.selectedId !== seam.id) return
  if (outcome.status === 'error') {
    setNotice(outcome.error)
    return
  }
  now.setInsertion({ seamId: seam.id, frames: outcome.frames, frame: 0, playing: false })
}
