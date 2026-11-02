import type { KnownUnits } from '../core/mesh/units'
import { sampleManifestSchema, type SampleEntry, type SampleManifest } from '../core/samples/manifest'
import { DEFAULT_DETECT_SETTINGS, type DetectSettings } from '../core/seams/detect'
import type { GeometryClient } from '../worker/client'
import type { LoadOutcome, Progress, Stage, UserError } from '../worker/geometry.api'
import { useStore } from './store'

export type FetchFn = (url: string) => Promise<Response>

export type ManifestOutcome = { status: 'ok'; manifest: SampleManifest } | { status: 'error'; error: UserError }

const SAMPLES_URL = `${import.meta.env.BASE_URL}samples/`

const STAGE_LABELS: Record<Stage, string> = {
  read: 'Reading file',
  weld: 'Merging vertices',
  topology: 'Building edge topology',
  index: 'Preparing display',
  contact: 'Indexing bodies for contact',
  detect: 'Detecting seams',
}

// Each import or unit answer takes a generation, so progress from an older call cannot repaint a newer bar.
let importGeneration = 0
// Each detect call takes a number; only the newest call's result is applied.
let detectRequest = 0
let scheduledDetect: ReturnType<typeof setTimeout> | undefined

export const DETECT_DEBOUNCE_MS = 250

function workerFailure(error: unknown): UserError {
  const detail = error instanceof Error ? error.message : String(error)
  return {
    what: 'The geometry worker stopped responding.',
    why: `The background worker that reads and analyses the part failed: ${detail}`,
    next: 'Reload the page and load the file again.',
  }
}

function unexpectedFailure(error: unknown): UserError {
  const detail = error instanceof Error ? error.message : String(error)
  return {
    what: 'Something unexpected went wrong while loading the part.',
    why: `The app could not make sense of what happened next (${detail}).`,
    next: 'Load the file again. If it keeps happening, reload the page.',
  }
}

// Last line of defence: whatever a flow throws ends up in the error banner instead of a bar that never finishes.
async function guarded(work: () => Promise<void>): Promise<void> {
  try {
    await work()
  } catch (error) {
    useStore.setState({ detectBusy: false })
    showError(unexpectedFailure(error))
  }
}

async function attempt<T extends { status: string }>(work: () => Promise<T>): Promise<T | { status: 'error'; error: UserError }> {
  try {
    return await work()
  } catch (error) {
    return { status: 'error', error: workerFailure(error) }
  }
}

function showError(error: UserError): void {
  useStore.setState({ importState: { phase: 'error', error } })
}

function loadingProgress(generation: number): Progress {
  // Progress travels on its own channel and can land after the outcome, so it only counts while this load is still the bar.
  return (stage, fraction) => {
    if (generation !== importGeneration || useStore.getState().importState.phase !== 'loading') return
    useStore.setState({ importState: { phase: 'loading', label: STAGE_LABELS[stage], fraction } })
  }
}

async function applyLoad(outcome: LoadOutcome, fileName: string, client: GeometryClient): Promise<void> {
  if (outcome.status === 'needs-units') {
    useStore.setState({
      importState: { phase: 'needs-units', fileName, maxDimension: outcome.maxDimension, guess: outcome.guess },
    })
    return
  }
  if (outcome.status === 'error') {
    showError(outcome.error)
    return
  }
  useStore.setState({
    part: outcome.part,
    display: outcome.display,
    importState: { phase: 'idle' },
    seams: [],
    statusById: {},
    typeById: {},
    selectedId: null,
    hoverId: null,
    detectSettings: DEFAULT_DETECT_SETTINGS,
    detectBusy: false,
    activeStep: 'seams',
  })
  useStore.temporal.getState().clear()
  // A slider change still waiting would run the old angle on the new part.
  clearTimeout(scheduledDetect)
  await runDetect(DEFAULT_DETECT_SETTINGS, client)
}

// The buffer is handed to the worker, so it is empty once this call returns.
export async function importBuffer(buffer: ArrayBuffer, name: string, client: GeometryClient): Promise<void> {
  await guarded(async () => {
    const generation = ++importGeneration
    useStore.setState({ importState: { phase: 'loading', label: STAGE_LABELS.read, fraction: 0 } })
    const outcome = await attempt(() => client.loadStl(buffer, name, loadingProgress(generation)))
    await applyLoad(outcome, name, client)
  })
}

// Reading a large file takes time, so the bar shows from the first moment rather than after the bytes arrive.
export async function importFile(file: Pick<File, 'name' | 'arrayBuffer'>, client: GeometryClient): Promise<void> {
  await guarded(async () => {
    useStore.setState({ importState: { phase: 'loading', label: STAGE_LABELS.read, fraction: 0 } })
    let buffer: ArrayBuffer
    try {
      buffer = await file.arrayBuffer()
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      showError({
        what: `${file.name} could not be read.`,
        why: `The browser refused to give the app the file's contents (${detail}).`,
        next: 'Check that the file still exists and is not open in another program, then choose it again.',
      })
      return
    }
    await importBuffer(buffer, file.name, client)
  })
}

// A file dropped outside the import panel. With a part open the Import step opens instead of loading, because that is
// where the warning about discarding accepted seams is shown. Nothing starts while a load or a unit question is open.
export function dropFile(file: Pick<File, 'name' | 'arrayBuffer'> | undefined, client: GeometryClient): void {
  const { part, activeStep, importState, setActiveStep } = useStore.getState()
  if (!file || importState.phase === 'loading' || importState.phase === 'needs-units') return
  if (part !== null && activeStep !== 'import') {
    setActiveStep('import')
    return
  }
  void importFile(file, client)
}

export async function chooseUnits(units: KnownUnits, client: GeometryClient): Promise<void> {
  await guarded(async () => {
    const { importState } = useStore.getState()
    if (importState.phase !== 'needs-units') return
    const generation = ++importGeneration
    useStore.setState({ importState: { phase: 'loading', label: STAGE_LABELS.weld, fraction: 0 } })
    const outcome = await attempt(() => client.setUnits(units, loadingProgress(generation)))
    await applyLoad(outcome, importState.fileName, client)
  })
}

// Never touches statusById: accepted seams that this result lacks stay accepted and return with the settings.
export async function runDetect(settings: DetectSettings, client: GeometryClient): Promise<void> {
  await guarded(async () => {
    const request = ++detectRequest
    useStore.setState({ detectBusy: true })
    const outcome = await attempt(() => client.detect(settings, () => {}))
    if (request !== detectRequest) return
    if (outcome.status === 'error') {
      useStore.setState({ detectBusy: false, importState: { phase: 'error', error: outcome.error } })
      return
    }
    const { selectedId, hoverId } = useStore.getState()
    const ids = new Set(outcome.seams.map((seam) => seam.id))
    useStore.setState({
      seams: outcome.seams,
      detectBusy: false,
      selectedId: selectedId !== null && ids.has(selectedId) ? selectedId : null,
      hoverId: hoverId !== null && ids.has(hoverId) ? hoverId : null,
    })
  })
}

// For a slider: the readout follows every change, detection runs once the slider has been still for the delay.
export function scheduleDetect(settings: DetectSettings, client: GeometryClient, delayMs = DETECT_DEBOUNCE_MS): void {
  if (useStore.getState().part === null) return
  useStore.getState().setDetectSettings(settings)
  clearTimeout(scheduledDetect)
  scheduledDetect = setTimeout(() => void runDetect(settings, client), delayMs)
}

const MANIFEST_NEXT = 'Reload the page. You can still choose your own STL file.'

export async function fetchManifest(fetchFn: FetchFn): Promise<ManifestOutcome> {
  const url = `${SAMPLES_URL}manifest.json`
  let response: Response
  try {
    response = await fetchFn(url)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      status: 'error',
      error: {
        what: 'The sample list could not be loaded.',
        why: `The request for ${url} failed (${detail}), so the sample parts cannot be offered.`,
        next: `Check your connection. ${MANIFEST_NEXT}`,
      },
    }
  }
  if (!response.ok) {
    return {
      status: 'error',
      error: {
        what: 'The sample list could not be loaded.',
        why: `The server answered ${[response.status, response.statusText].filter(Boolean).join(' ')} for ${url}.`,
        next: `The app may have been deployed without its sample files. ${MANIFEST_NEXT}`,
      },
    }
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return {
      status: 'error',
      error: {
        what: 'The sample list is not readable.',
        why: `${url} did not contain JSON, which usually means the server returned a web page instead.`,
        next: MANIFEST_NEXT,
      },
    }
  }
  const parsed = sampleManifestSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return {
      status: 'error',
      error: {
        what: 'The sample list is not valid.',
        why: `${url} does not match the expected format (${where}${issue?.message ?? 'unknown problem'}).`,
        next: 'Rebuild the samples with npx tsx scripts/generate-samples.ts, then reload the page.',
      },
    }
  }
  return { status: 'ok', manifest: parsed.data }
}

export async function importSample(entry: SampleEntry, client: GeometryClient, fetchFn: FetchFn): Promise<void> {
  await guarded(async () => {
    useStore.setState({ importState: { phase: 'loading', label: 'Downloading sample', fraction: 0 } })
    const url = `${SAMPLES_URL}${entry.file}`
    let buffer: ArrayBuffer
    try {
      const response = await fetchFn(url)
      if (!response.ok) {
        showError({
          what: `The sample "${entry.name}" could not be downloaded.`,
          why: `The server answered ${response.status} for ${url}.`,
          next: 'Reload the page and try again, or choose your own STL file.',
        })
        return
      }
      buffer = await response.arrayBuffer()
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      showError({
        what: `The sample "${entry.name}" could not be downloaded.`,
        why: `The request for ${url} failed (${detail}).`,
        next: 'Check your connection, then try again or choose your own STL file.',
      })
      return
    }
    await importBuffer(buffer, entry.file, client)
  })
}
