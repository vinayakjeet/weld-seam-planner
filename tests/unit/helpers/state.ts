import type { SeamCandidate } from '../../../src/core/seams/detect'
import { useStore } from '../../../src/state/store'
import type { DetectOutcome, DisplayData, GeometryApi, LoadOutcome, PartInfo } from '../../../src/worker/geometry.api'

export function resetStore(): void {
  useStore.setState(useStore.getInitialState(), true)
  useStore.temporal.getState().clear()
}

export function seam(id: string, confidence = 0.9, lengthMm = 200, overrides: Partial<SeamCandidate> = {}): SeamCandidate {
  return {
    id,
    label: id.toUpperCase(),
    source: 'crease',
    concavity: 'known',
    jointType: 'fillet',
    hidden: false,
    confidence,
    closed: false,
    lengthMm,
    openingAngleDeg: 90,
    points: [],
    thicknessMm: [null, null],
    ...overrides,
  }
}

// Corner candidates come back from detection but stay hidden, so counts in tests are of the visible seams.
export const shown = (seams: SeamCandidate[]): SeamCandidate[] => seams.filter((s) => !s.hidden)

export const corner = (id: string, confidence = 0.9, lengthMm = 100): SeamCandidate =>
  seam(id, confidence, lengthMm, { jointType: 'corner', hidden: true })

export function partInfo(overrides: Partial<PartInfo> = {}): PartInfo {
  return {
    name: 'a.stl',
    sha256: 'a'.repeat(64),
    triangles: 44,
    bodies: 1,
    bbox: { min: [0, 0, 0], max: [200, 120, 90] },
    sourceUnits: 'mm',
    scaleToMm: 1,
    boundaryEdges: 0,
    nonManifoldEdges: 0,
    droppedDegenerate: 0,
    reorientedBodies: 0,
    unsignedBodies: 0,
    ...overrides,
  }
}

export function displayStub(): DisplayData {
  return {
    positions: new Float32Array(9),
    indices: new Uint32Array(3),
    bvh: { roots: [], index: null, indirectBuffer: null },
  }
}

export function readyOutcome(overrides: Partial<PartInfo> = {}): LoadOutcome {
  return { status: 'ready', part: partInfo(overrides), display: displayStub() }
}

export function detected(seams: SeamCandidate[]): DetectOutcome {
  return { status: 'ok', seams, ms: 1 }
}

export function fakeClient(impl: Partial<GeometryApi> = {}): GeometryApi {
  return {
    loadStl: async () => {
      throw new Error('unexpected loadStl')
    },
    setUnits: async () => {
      throw new Error('unexpected setUnits')
    },
    detect: async () => detected([]),
    snapDraw: async () => {
      throw new Error('unexpected snapDraw')
    },
    torchPositions: async () => {
      throw new Error('unexpected torchPositions')
    },
    torchPoses: async () => {
      throw new Error('unexpected torchPoses')
    },
    preflight: async () => {
      throw new Error('unexpected preflight')
    },
    access: async () => {
      throw new Error('unexpected access')
    },
    planTiming: async () => {
      throw new Error('unexpected planTiming')
    },
    optimiseSequence: async () => {
      throw new Error('unexpected optimiseSequence')
    },
    exportJob: async () => {
      throw new Error('unexpected exportJob')
    },
    ...impl,
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
