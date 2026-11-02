import { transfer } from 'comlink'
import { BufferAttribute, BufferGeometry } from 'three'
import { MeshBVH, type SerializedBVH } from 'three-mesh-bvh'
import type { Vec3 } from '../core/math/vec3'
import { computeBounds } from '../core/mesh/bounds'
import { computeFaceData } from '../core/mesh/faces'
import { buildMeshModel, type MeshModel } from '../core/mesh/model'
import { parseStl, StlError } from '../core/mesh/parseStl'
import { guessUnits, scaleToMm, type KnownUnits, type Units } from '../core/mesh/units'
import { buildBodyBvhs, type BodyBvh } from '../core/seams/bodyBvh'
import { detectSeams, type DetectSettings, type SeamCandidate } from '../core/seams/detect'
import { buildSnapContext, snapPolyline, type DrawClick, type SnapContext } from '../core/seams/draw'
import { isManualError } from '../core/seams/manual'

export type { DetectSettings, DrawClick, SeamCandidate, Units }

export interface UserError {
  what: string
  why: string
  next: string
}

export type Stage = 'read' | 'weld' | 'topology' | 'index' | 'contact' | 'detect'

// fraction is the overall progress of the current call, 0 to 1, and never decreases.
export type Progress = (stage: Stage, fraction: number) => void

export interface PartInfo {
  name: string
  triangles: number
  bodies: number
  bbox: { min: Vec3; max: Vec3 }
  sourceUnits: KnownUnits
  scaleToMm: number
  boundaryEdges: number
  nonManifoldEdges: number
  droppedDegenerate: number
  reorientedBodies: number
  unsignedBodies: number
}

export interface DisplayData {
  positions: Float32Array
  // Already in the order the BVH expects: building a BVH reorders the triangles.
  indices: Uint32Array
  bvh: SerializedBVH
}

export type LoadOutcome =
  | { status: 'needs-units'; maxDimension: number; guess: Units }
  | { status: 'ready'; part: PartInfo; display: DisplayData }
  | { status: 'error'; error: UserError }

export type DetectOutcome = { status: 'ok'; seams: SeamCandidate[]; ms: number } | { status: 'error'; error: UserError }

export type SnapOutcome = { status: 'ok'; seam: SeamCandidate } | { status: 'error'; error: UserError }

export interface GeometryApi {
  loadStl(buffer: ArrayBuffer, name: string, onProgress: Progress): Promise<LoadOutcome>
  setUnits(units: KnownUnits, onProgress: Progress): Promise<LoadOutcome>
  detect(settings: DetectSettings, onProgress: Progress): Promise<DetectOutcome>
  // Turns the user's clicks on the part into one seam snapped to its edges.
  snapDraw(clicks: DrawClick[], snapRadiusMm: number): Promise<SnapOutcome>
}

// Where each load stage starts on the overall bar; the index stage runs to 1.
// Weights follow the measured split on a 1M triangle part: read 4%, weld 24%, topology 49%, index 22%.
const STAGE_START = { read: 0, weld: 0.05, topology: 0.3, index: 0.8 } as const

// The BVH builder reports once per leaf, which is tens of thousands of calls and each one is a worker message.
const MIN_PROGRESS_STEP = 0.01

function reporter(onProgress: Progress): Progress {
  let last = 0
  let sent = -1
  let sentStage: Stage | null = null
  return (stage, fraction) => {
    last = Math.max(last, Math.min(1, Math.max(0, fraction)))
    if (stage === sentStage && last < 1 && last - sent < MIN_PROGRESS_STEP) return
    sent = last
    sentStage = stage
    try {
      // Across a worker boundary the callback returns a promise; progress is cosmetic, so a failing UI callback must not fail the load.
      void Promise.resolve(onProgress(stage, last)).catch(() => undefined)
    } catch {
      return
    }
  }
}

function toUserError(error: unknown): UserError {
  if (error instanceof StlError) return { what: error.what, why: error.why, next: error.next }
  const detail = error instanceof Error ? error.message : String(error)
  return {
    what: 'The part could not be processed.',
    why: `An unexpected error stopped the geometry worker: ${detail}`,
    next: 'Load the file again. If it keeps failing, export it again from your CAD tool.',
  }
}

function buildDisplay(model: MeshModel, report: Progress): DisplayData {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(model.mesh.positions.slice(), 3))
  geometry.setIndex(new BufferAttribute(model.mesh.indices.slice(), 1))
  const bvh = new MeshBVH(geometry, {
    onProgress: (p) => report('index', STAGE_START.index + (1 - STAGE_START.index) * p),
  })
  return {
    positions: geometry.getAttribute('position').array as Float32Array,
    indices: geometry.getIndex()!.array as Uint32Array,
    bvh: MeshBVH.serialize(bvh, { cloneBuffers: false }),
  }
}

function describePart(model: MeshModel, name: string, units: KnownUnits): PartInfo {
  return {
    name,
    triangles: model.mesh.triangleCount,
    bodies: model.bodies.count,
    bbox: { min: model.bounds.min, max: model.bounds.max },
    sourceUnits: units,
    scaleToMm: scaleToMm(units),
    boundaryEdges: model.edges.stats.boundary,
    nonManifoldEdges: model.edges.stats.nonManifold,
    droppedDegenerate: model.droppedDegenerate,
    reorientedBodies: model.orientation.reorientedBodies.length,
    unsignedBodies: model.orientation.unsignedBodies.length,
  }
}

export function createGeometryApi(): GeometryApi {
  let pending: { soup: Float32Array; name: string } | null = null
  let current: MeshModel | null = null
  // Built on the first detect of a multi body part and kept until another part replaces it.
  let bodyBvhs: BodyBvh[] | null = null
  // Feature edges and the surface BVH for drawing, built on the first drawn seam of a part.
  let snapContext: SnapContext | null = null

  function build(soup: Float32Array, name: string, units: KnownUnits, report: Progress): LoadOutcome {
    const model = buildMeshModel(soup, scaleToMm(units), (stage) => report(stage, STAGE_START[stage]))
    report('index', STAGE_START.index)
    const display = buildDisplay(model, report)
    report('index', 1)
    // Only a fully built part replaces the current one, so a failed load leaves the old part usable.
    current = model
    bodyBvhs = null
    snapContext = null
    const outcome: LoadOutcome = { status: 'ready', part: describePart(model, name, units), display }
    const buffers = [display.positions.buffer, display.indices.buffer, ...display.bvh.roots]
    return transfer(outcome, buffers as Transferable[])
  }

  return {
    async loadStl(buffer, name, onProgress) {
      const report = reporter(onProgress)
      pending = null
      try {
        report('read', 0)
        const { positions } = parseStl(buffer)
        const { maxDimension } = computeBounds(positions)
        report('read', STAGE_START.weld)
        const guess = guessUnits(maxDimension)
        // A part of exactly zero size has nothing to scale; building it gives the clearer "no usable triangles" error.
        if (guess === 'mm' || maxDimension === 0) return build(positions, name, 'mm', report)
        pending = { soup: positions, name }
        return { status: 'needs-units', maxDimension, guess }
      } catch (error) {
        return { status: 'error', error: toUserError(error) }
      }
    },

    async setUnits(units, onProgress) {
      const waiting = pending
      pending = null
      if (!waiting) {
        return {
          status: 'error',
          error: {
            what: 'No file is waiting for a unit choice.',
            why: 'Units are only asked for after a file has been read, and none is pending.',
            next: 'Choose an STL file or a sample again.',
          },
        }
      }
      try {
        return build(waiting.soup, waiting.name, units, reporter(onProgress))
      } catch (error) {
        return { status: 'error', error: toUserError(error) }
      }
    },

    async detect(settings, onProgress) {
      if (!current) {
        return {
          status: 'error',
          error: {
            what: 'There is no part to analyse.',
            why: 'Seam detection needs a loaded STL and none has been loaded in this session.',
            next: 'Choose an STL file or a sample, then run detection again.',
          },
        }
      }
      const report = reporter(onProgress)
      try {
        const needsBvhs = current.bodies.count > 1 && bodyBvhs === null
        report(needsBvhs ? 'contact' : 'detect', 0)
        const start = performance.now()
        if (needsBvhs) {
          bodyBvhs = buildBodyBvhs(current)
          report('detect', 0.3)
        }
        const seams = detectSeams(current, settings, { bodyBvhs: bodyBvhs ?? undefined })
        const ms = performance.now() - start
        report('detect', 1)
        return { status: 'ok', seams, ms }
      } catch (error) {
        return { status: 'error', error: toUserError(error) }
      }
    },

    async snapDraw(clicks, snapRadiusMm) {
      if (!current) {
        return {
          status: 'error',
          error: {
            what: 'There is no part to draw on.',
            why: 'Drawing a seam needs a loaded STL and none has been loaded in this session.',
            next: 'Choose an STL file or a sample, then draw the seam again.',
          },
        }
      }
      try {
        snapContext ??= buildSnapContext(current, computeFaceData(current.mesh))
        const result = snapPolyline(clicks, snapContext, snapRadiusMm)
        return isManualError(result) ? { status: 'error', error: result } : { status: 'ok', seam: result }
      } catch (error) {
        return { status: 'error', error: toUserError(error) }
      }
    },
  }
}
