import { proxy, transfer, wrap, type Endpoint } from 'comlink'
import type {
  AccessOutcome,
  InsertionOutcome,
  ReachOutcome,
  DetectOutcome,
  ExportOutcome,
  PreflightOutcome,
  PlaybackOutcome,
  SequenceOutcome,
  TimingOutcome,
  GeometryApi,
  LoadOutcome,
  Progress,
  SnapOutcome,
  TorchPosesOutcome,
  TorchPositionsOutcome,
  UserError,
} from './geometry.api'
import { createRecoveringClient } from './recovery'

export type GeometryClient = GeometryApi

export const DEFAULT_TIMEOUT_MS = 30_000
const PREVIEW_TIMEOUT_MS = 1500

export interface ClientOptions {
  // A call fails when the worker sends nothing for this long. Progress counts as a reply, so a slow load is not cut off.
  timeoutMs?: number
  // Settles with the browser's description when the worker is dead (script failed to load, uncaught error).
  failure?: Promise<string>
  // Called when a call fails because the worker is silent or dead, so the owner can replace it.
  onFailure?: () => void
}

type Failed = { status: 'error'; error: UserError }

function failed(what: string, why: string, next: string): Failed {
  return { status: 'error', error: { what, why, next } }
}

function duration(ms: number): string {
  return ms >= 1000 ? `${Math.round(ms / 1000)} seconds` : `${ms} ms`
}

const SKIPPED = Symbol('skipped')

// Always settles: with the worker's answer, or with a readable error if it is silent, dead or throws.
function supervise<T>(options: ClientOptions, doing: string, run: (activity: () => void) => Promise<T>): Promise<T | Failed> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return new Promise((resolve) => {
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (value: T | Failed, workerLost = false) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (workerLost) options.onFailure?.()
      resolve(value)
    }
    const activity = () => {
      if (done) return
      clearTimeout(timer)
      timer = setTimeout(
        () =>
          finish(
            failed(
              'The geometry worker did not answer.',
              `Nothing came back within ${duration(timeoutMs)} while ${doing}, so the background worker is stuck or has crashed.`,
              'Load the file again. If it keeps happening, try a smaller file or reload the page.',
            ),
            true,
          ),
        timeoutMs,
      )
    }
    activity()
    void options.failure?.then((detail) =>
      finish(
        failed(
          'The geometry worker stopped.',
          `The browser reported an error in the background worker: ${detail}`,
          'Reload the page and load the file again. If it keeps happening, try another browser.',
        ),
        true,
      ),
    )
    Promise.resolve()
      .then<T | typeof SKIPPED>(() => (done ? SKIPPED : run(activity)))
      .then(
        (value) => {
          if (value !== SKIPPED) finish(value)
        },
        (error: unknown) =>
          finish(
            failed(
              'The geometry worker reported an error.',
              error instanceof Error ? error.message : String(error),
              'Load the file again. If it keeps happening, reload the page.',
            ),
          ),
      )
  })
}

function watching(activity: () => void, onProgress: Progress): Progress {
  return proxy<Progress>((stage, fraction) => {
    activity()
    onProgress(stage, fraction)
  })
}

// loadStl moves the file's bytes to the worker, so the ArrayBuffer passed in is empty afterwards.
export function wrapGeometryApi(endpoint: Endpoint, options: ClientOptions = {}): GeometryClient {
  const remote = wrap<GeometryApi>(endpoint)
  return {
    loadStl: (buffer, name, onProgress) =>
      supervise<LoadOutcome>(options, 'reading the file', (activity) =>
        remote.loadStl(transfer(buffer, [buffer]), name, watching(activity, onProgress)),
      ),
    setUnits: (units, onProgress) =>
      supervise<LoadOutcome>(options, 'applying the unit choice', (activity) => remote.setUnits(units, watching(activity, onProgress))),
    detect: (settings, onProgress) =>
      supervise<DetectOutcome>(options, 'detecting seams', (activity) => remote.detect(settings, watching(activity, onProgress))),
    snapDraw: (clicks, snapRadiusMm) =>
      supervise<SnapOutcome>(options, 'snapping the drawn seam', () => remote.snapDraw(clicks, snapRadiusMm)),
    // A hover aid: a slow or dead worker gives no marker, and does not count as a failure that replaces the worker.
    snapPreview: (point, radiusMm) =>
      Promise.race([remote.snapPreview(point, radiusMm).catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), PREVIEW_TIMEOUT_MS))]),
    torchPositions: (seams, gravity) =>
      supervise<TorchPositionsOutcome>(options, 'working out the welding positions', () => remote.torchPositions(seams, gravity)),
    torchPoses: (seam, params) =>
      supervise<TorchPosesOutcome>(options, 'working out the torch poses', () => remote.torchPoses(seam, params)),
    access: (seams, onProgress) =>
      supervise<AccessOutcome>(options, 'checking torch access', (activity) => remote.access(seams, watching(activity, onProgress))),
    reach: (seams, ports, arm, onProgress) =>
      supervise<ReachOutcome>(options, 'measuring snake arm reach', (activity) => remote.reach(seams, ports, arm, watching(activity, onProgress))),
    // A stop request; the reach it stops answers for itself, so this is not supervised.
    cancelReach: () => remote.cancelReach().catch(() => undefined),
    insertion: (seam, s, port, arm, approachMm) =>
      supervise<InsertionOutcome>(options, 'working out the arm insertion', () => remote.insertion(seam, s, port, arm, approachMm)),
    preflight: (plan) => supervise<PreflightOutcome>(options, 'checking the plan', () => remote.preflight(plan)),
    exportJob: (plan, createdAt) => supervise<ExportOutcome>(options, 'building the job file', () => remote.exportJob(plan, createdAt)),
    planTiming: (plan) => supervise<TimingOutcome>(options, 'working out the cycle time', () => remote.planTiming(plan)),
    playbackPath: (plan) => supervise<PlaybackOutcome>(options, 'working out the torch path', () => remote.playbackPath(plan)),
    optimiseSequence: (plan, strategy, locked, current, onProgress) =>
      supervise<SequenceOutcome>(options, 'ordering the seams', (activity) =>
        remote.optimiseSequence(
          plan,
          strategy,
          locked,
          current,
          // A long search counts as alive while it reports, so the watchdog does not replace the worker under it.
          onProgress &&
            proxy((fraction: number) => {
              activity()
              onProgress(fraction)
            }),
        ),
      ),
  }
}

export function watchWorker(target: EventTarget): Promise<string> {
  return new Promise((resolve) => {
    target.addEventListener('error', (event) => {
      const { message } = event as Partial<ErrorEvent>
      resolve(message || 'the worker script could not be loaded or crashed without a message')
    })
    target.addEventListener('messageerror', () => resolve('the worker sent data the browser could not read'))
  })
}

// One browser worker. When it stops answering it is terminated and onDead is called; it does not come back by itself.
export function createGeometryClient(onDead?: () => void): GeometryClient {
  const worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' })
  return wrapGeometryApi(worker, {
    failure: watchWorker(worker),
    onFailure: () => {
      worker.terminate()
      onDead?.()
    },
  })
}

let shared: GeometryClient | null = null

// Replaces dead workers and re-sends the loaded file to the new one, so the part survives a crash or timeout.
export function getGeometryClient(): GeometryClient {
  shared ??= createRecoveringClient(createGeometryClient)
  return shared
}
