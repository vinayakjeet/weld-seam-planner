import type { UserError } from '../worker/geometry.api'
import type { GeometryClient } from '../worker/client'
import type { DeepLink } from '../ui/shell/deepLink'
import { accessFor } from './accessSlice'
import { beginDemoSession } from './autosave'
import { DEMO_PORT, DEMO_PROCEDURE, DEMO_SAMPLE, DEMO_SEAM_ID, DEMO_STATION_MM } from './demo'
import { ensureAccess, fetchManifest, importSample, setNotice, showError, type FetchFn } from './flows'
import { runReach } from './reachFlow'
import { selectPlan } from './selectors'
import { useStore } from './store'

const DEMO_QUERY = `?sample=${DEMO_SAMPLE}&demo=1`

const notFound = (id: string, ids: string[]): UserError => ({
  what: `The sample "${id}" was not found.`,
  why: 'The link names a sample this build does not have.',
  next: `Pick one of ${ids.join(', ')} on the start screen, or remove ?sample from the address.`,
})

// Accepted seams that the access check has not answered for yet.
const awaitingAccess = () => {
  const state = useStore.getState()
  return selectPlan(state).seams.filter((planned) => accessFor(state, planned.seam) === null)
}

// A request from the interface can overtake this one and its answer is then dropped, so ask again until every seam has one.
async function accessReady(client: GeometryClient): Promise<UserError | null> {
  for (let tries = 0; tries < 3 && awaitingAccess().length > 0; tries++) {
    const error = await ensureAccess(client)
    if (error) return error
  }
  return null
}

// Everything the demo does to the tank, in the order a person would: accept, give a procedure, place the port, measure the
// reach of the seams that need the arm, then stop on one seam at a station the arm reaches.
async function runDemo(client: GeometryClient): Promise<UserError | null> {
  const state = useStore.getState()
  state.acceptAbove(0)
  const ids = Object.entries(useStore.getState().statusById).filter(([, status]) => status === 'accepted').map(([id]) => id)
  const refused = state.assignProcedure(ids, DEMO_PROCEDURE)
  if (refused) return refused
  state.addPort(DEMO_PORT.position, DEMO_PORT.direction)
  state.setActiveStep('access')
  // The arm works inside the tank, so the part is shown see-through.
  if (!state.xray) state.toggleXray()
  const noAccess = await accessReady(client)
  if (noAccess) return noAccess
  await runReach(client)
  const done = useStore.getState()
  done.select(DEMO_SEAM_ID)
  done.setScrub(DEMO_STATION_MM)
  setNotice({
    what: 'Autosave is paused for this demo.',
    why: 'Saving the demo would replace the plan you saved for this part.',
    next: 'Export the plan to keep your changes.',
  })
  return null
}

// Opens what the address asks for. The id is only ever compared with the manifest's ids, so a path in it cannot reach a
// fetch. Returns what went wrong, or null; errors are also put in the import banner, where the person will see them.
export async function openDeepLink(link: DeepLink, client: GeometryClient, fetchFn: FetchFn): Promise<UserError | null> {
  if (link.sample === null) {
    if (link.demo) {
      setNotice({
        what: 'The demo was not started.',
        why: 'The address has demo=1 but names no sample, and the demo is defined for one sample only.',
        next: `Open ${DEMO_QUERY}, or choose a sample on the start screen.`,
      })
    }
    return null
  }
  const manifest = await fetchManifest(fetchFn)
  if (manifest.status === 'error') {
    showError(manifest.error)
    return manifest.error
  }
  const { samples } = manifest.manifest
  const entry = samples.find((sample) => sample.id === link.sample)
  if (!entry) {
    const error = notFound(link.sample, samples.map((sample) => sample.id))
    showError(error)
    return error
  }

  const demo = link.demo && entry.id === DEMO_SAMPLE
  if (demo) beginDemoSession()
  await importSample(entry, client, fetchFn)

  if (link.demo && !demo) {
    setNotice({
      what: 'The demo was not started.',
      why: `demo=1 is defined for the ${DEMO_SAMPLE} sample only, so ${entry.name} was opened without it.`,
      next: `Open ${DEMO_QUERY} for the demo, or go on with ${entry.name}.`,
    })
    return null
  }
  // A failed load has already put its reason in the banner.
  if (!demo || useStore.getState().part === null) return null
  return runDemo(client)
}
