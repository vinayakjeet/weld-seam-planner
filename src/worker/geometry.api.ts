import { transfer } from 'comlink'
import { BufferAttribute, BufferGeometry } from 'three'
import { MeshBVH, type SerializedBVH } from 'three-mesh-bvh'
import type { Vec3 } from '../core/math/vec3'
import { occluderFromBvh } from '../core/access/occluder'
import { seamAccess, type AccessAnalysis } from '../core/access/clearance'
import { exportJob, type ExportResult } from '../core/job/build'
import type { Plan } from '../core/job/plan'
import { preflight, type Issue } from '../core/job/preflight'
import { planTiming, type PlanTiming } from '../core/job/timing'
import { playbackPathOf, type PlaybackPath } from '../core/sequence/playback'
import { homePoint } from '../core/job/build'
import { balancedEdge } from '../core/sequence/balance'
import { nodesFromPlan } from '../core/sequence/nodes'
import { reconcileOrder, resetToTable } from '../core/sequence/order'
import { airEdge, optimise } from '../core/sequence/tsp'
import type { SequenceStrategy, Visit } from '../core/sequence/types'
import { computeBounds } from '../core/mesh/bounds'
import { computeFaceData } from '../core/mesh/faces'
import { sha256Hex } from '../core/mesh/hash'
import { displayOrigin, toLocalArray } from '../core/mesh/displayOrigin'
import { buildMeshModel, type MeshModel } from '../core/mesh/model'
import { parseStl, StlError } from '../core/mesh/parseStl'
import { guessUnits, scaleToMm, type KnownUnits, type Units } from '../core/mesh/units'
import { buildBodyBvhs, buildWholeBvh, type BodyBvh } from '../core/seams/bodyBvh'
import { detectSeams, type DetectSettings, type SeamCandidate } from '../core/seams/detect'
import { buildSnapContext, snapPoint, snapPolyline, type DrawClick, type SnapContext } from '../core/seams/draw'
import { isManualError } from '../core/seams/manual'
import { probeFromBvhs, seamThickness } from '../core/seams/thickness'
import { torchPoses, type TorchParams, type TorchPose } from '../core/torch/frames'
import { gravityProblem, seamPosition, type Gravity, type SeamPosition } from '../core/torch/positions'
import type { ArmParams, Port } from '../core/snake/arm'
import { proximityFromBvh, solveArm } from '../core/snake/collision'
import { approachGoal, insertion as insertArm, type InsertionFrame } from '../core/snake/ftl'
import { seamReachSteps, type SeamReach } from '../core/snake/reach'
import { rotate } from '../core/math/quat'
import { poseAt, DEFAULT_TORCH } from '../core/torch/frames'

export type { DetectSettings, DrawClick, SeamCandidate, Units }

export interface UserError {
  what: string
  why: string
  next: string
}

export type Stage = 'read' | 'weld' | 'topology' | 'index' | 'contact' | 'detect' | 'access' | 'reach'

// fraction is the overall progress of the current call, 0 to 1, and never decreases.
export type Progress = (stage: Stage, fraction: number) => void

export interface PartInfo {
  name: string
  // Of the file bytes as read, so a saved plan can tell which part it belongs to.
  sha256: string
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

export type TorchPositionsOutcome = { status: 'ok'; positions: Record<string, SeamPosition> } | { status: 'error'; error: UserError }

export type TorchPosesOutcome = { status: 'ok'; poses: TorchPose[] } | { status: 'error'; error: UserError }

export type PreflightOutcome = { status: 'ok'; issues: Issue[] } | { status: 'error'; error: UserError }

export type SequenceOutcome =
  | { status: 'ok'; order: { seamId: string; reversed: boolean }[]; moves: PlanTiming['moves'] }
  | { status: 'error'; error: UserError }

export type PlaybackOutcome = { status: 'ok'; path: PlaybackPath; timing: PlanTiming } | { status: 'error'; error: UserError }

export type TimingOutcome = { status: 'ok'; timing: PlanTiming } | { status: 'error'; error: UserError }

// ExportResult already has an error arm with the same what, why and next fields.
export type AccessOutcome =
  | { status: 'ok'; results: Record<string, AccessAnalysis>; ms: number }
  | { status: 'error'; error: UserError }

export type ReachOutcome =
  | { status: 'ok'; results: Record<string, SeamReach>; ms: number }
  | { status: 'error'; error: UserError }
  // Stopped by cancelReach; nothing of the run is returned.
  | { status: 'cancelled' }

export type InsertionOutcome = { status: 'ok'; frames: InsertionFrame[] } | { status: 'error'; error: UserError }

export type ExportOutcome = ExportResult

export interface GeometryApi {
  loadStl(buffer: ArrayBuffer, name: string, onProgress: Progress): Promise<LoadOutcome>
  setUnits(units: KnownUnits, onProgress: Progress): Promise<LoadOutcome>
  detect(settings: DetectSettings, onProgress: Progress): Promise<DetectOutcome>
  // Turns the user's clicks on the part into one seam snapped to its edges.
  snapDraw(clicks: DrawClick[], snapRadiusMm: number): Promise<SnapOutcome>
  // Where a click at this point would land: the same snap as the first click of snapDraw. Null when no part is loaded or no
  // edge is within the radius; it never reports an error, because it only feeds a hover marker.
  snapPreview(point: Vec3, radiusMm: number): Promise<Vec3 | null>
  // Welding position of every seam under one gravity, keyed by seam id. Needs no part: it reads the seams alone.
  // A seam without points is left out.
  torchPositions(seams: SeamCandidate[], gravity: Gravity): Promise<TorchPositionsOutcome>
  // Torch poses along one seam; the main thread scrubs between them with poseAt.
  torchPoses(seam: SeamCandidate, params: TorchParams): Promise<TorchPosesOutcome>
  // Free torch cone of every seam, keyed by seam id. Needs the loaded part: it casts rays against the whole mesh.
  access(seams: SeamCandidate[], onProgress: Progress): Promise<AccessOutcome>
  // Snake-arm reach of every seam from the ports, keyed by seam id. Needs the loaded part: the arm is kept off its surface.
  reach(seams: SeamCandidate[], ports: Port[], arm: ArmParams, onProgress: Progress): Promise<ReachOutcome>
  // Stops a reach that is running at its next station; it settles as cancelled.
  cancelReach(): Promise<void>
  // The arm entering follow-the-leader through the port to the approach point of the torch pose at arc length s.
  insertion(seam: SeamCandidate, s: number, port: Port, arm: ArmParams, approachMm: number): Promise<InsertionOutcome>
  // Both read only the plan they are given, so they need no part in the worker.
  preflight(plan: Plan): Promise<PreflightOutcome>
  exportJob(plan: Plan, createdAt: string): Promise<ExportOutcome>
  // Arc, air and cycle time of the plan in its sequence order; the same figures as the exported summary.
  planTiming(plan: Plan): Promise<TimingOutcome>
  // The torch path of the plan in its sequence order, with the timing the playback runs on.
  playbackPath(plan: Plan): Promise<PlaybackOutcome>
  // Orders the seams of the plan by the strategy, starting from the current order. Locked seams keep their slot and
  // direction. Returns the new order and the air moves it gives, home included. onProgress hears the share of the
  // search done, 0 to 1; table order has no search and reports nothing.
  optimiseSequence(
    plan: Plan,
    strategy: SequenceStrategy,
    locked: string[],
    current: { seamId: string; reversed: boolean }[],
    onProgress?: (fraction: number) => void,
  ): Promise<SequenceOutcome>
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

// Across a worker boundary a progress callback returns a promise; progress is cosmetic, so a callback that fails must not fail the work.
function quietly(onProgress: ((fraction: number) => void) | undefined): ((fraction: number) => void) | undefined {
  if (!onProgress) return undefined
  return (fraction) => {
    try {
      void Promise.resolve(onProgress(fraction)).catch(() => undefined)
    } catch {
      // ignored on purpose
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

// A long reach gives way to the worker's messages this often, so a cancel is read between stations.
const GIVE_WAY_MS = 30

// One turn of the event loop, through a message so that it is not clamped like a timer.
function giveWay(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })
}

// Positions are drawn relative to displayOrigin of the part's box, which the viewport computes the same way.
function buildDisplay(model: MeshModel, report: Progress): DisplayData {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(toLocalArray(model.mesh.positions, displayOrigin(model.bounds)), 3))
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

function describePart(model: MeshModel, name: string, sha256: string, units: KnownUnits): PartInfo {
  return {
    name,
    sha256,
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
  let pending: { soup: Float32Array; name: string; sha256: string } | null = null
  let current: MeshModel | null = null
  // Built on the first detect of a multi body part and kept until another part replaces it.
  let bodyBvhs: BodyBvh[] | null = null
  // One BVH over every triangle of the part, built on first use and shared: detection rays on a single-body part,
  // access, reach, insertion and drawing.
  let partBvh: BodyBvh | null = null
  const wholeMesh = (model: MeshModel): BodyBvh => (partBvh ??= buildWholeBvh(model))
  // Feature edges and the surface BVH for drawing, built on the first drawn seam of a part.
  let snapContext: SnapContext | null = null

  function build(soup: Float32Array, name: string, sha256: string, units: KnownUnits, report: Progress): LoadOutcome {
    const model = buildMeshModel(soup, scaleToMm(units), (stage) => report(stage, STAGE_START[stage]))
    report('index', STAGE_START.index)
    const display = buildDisplay(model, report)
    report('index', 1)
    // Only a fully built part replaces the current one, so a failed load leaves the old part usable.
    current = model
    bodyBvhs = null
    partBvh = null
    snapContext = null
    const outcome: LoadOutcome = { status: 'ready', part: describePart(model, name, sha256, units), display }
    const buffers = [display.positions.buffer, display.indices.buffer, ...display.bvh.roots]
    return transfer(outcome, buffers as Transferable[])
  }

  // A running reach checks this between stations; cancelReach moves it on.
  let reachRun = 0

  const snapContextFor = (model: MeshModel) => buildSnapContext(model, computeFaceData(model.mesh), () => wholeMesh(model).bvh)

  return {
    async loadStl(buffer, name, onProgress) {
      const report = reporter(onProgress)
      pending = null
      try {
        report('read', 0)
        const sha256 = await sha256Hex(buffer)
        const { positions } = parseStl(buffer)
        const { maxDimension } = computeBounds(positions)
        report('read', STAGE_START.weld)
        const guess = guessUnits(maxDimension)
        // A part of exactly zero size has nothing to scale; building it gives the clearer "no usable triangles" error.
        if (guess === 'mm' || maxDimension === 0) return build(positions, name, sha256, 'mm', report)
        pending = { soup: positions, name, sha256 }
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
        return build(waiting.soup, waiting.name, waiting.sha256, units, reporter(onProgress))
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
        const wholeBvh = current.bodies.count < 2 ? wholeMesh(current) : null
        const seams = detectSeams(current, settings, { bodyBvhs: bodyBvhs ?? undefined, wholeBvh })
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
        snapContext ??= snapContextFor(current)
        const result = snapPolyline(clicks, snapContext, snapRadiusMm)
        if (isManualError(result)) return { status: 'error', error: result }
        if (result.approximateNormals) return { status: 'ok', seam: result }
        const thicknessMm = seamThickness(result.points, probeFromBvhs([snapContext.surface()]))
        return { status: 'ok', seam: { ...result, thicknessMm } }
      } catch (error) {
        return { status: 'error', error: toUserError(error) }
      }
    },

    async snapPreview(point, radiusMm) {
      if (!current) return null
      try {
        snapContext ??= snapContextFor(current)
        return snapPoint(snapContext, point, radiusMm)
      } catch {
        return null
      }
    },

    async torchPositions(seams, gravity) {
      const problem = gravityProblem(gravity)
      if (problem) return { status: 'error', error: problem }
      try {
        const positions: Record<string, SeamPosition> = {}
        for (const seam of seams) if (seam.points.length > 0) positions[seam.id] = seamPosition(seam.points, gravity)
        return { status: 'ok', positions }
      } catch (error) {
        return { status: 'error', error: toUserError(error) }
      }
    },

    async torchPoses(seam, params) {
      try {
        return { status: 'ok', poses: torchPoses(seam.points, seam.closed, params) }
      } catch (error) {
        return { status: 'error', error: toUserError(error) }
      }
    },

    async access(seams, onProgress) {
      if (!current) {
        return {
          status: 'error',
          error: {
            what: 'There is no part to check for torch access.',
            why: 'The access check casts rays against the part and none has been loaded in this session.',
            next: 'Choose an STL file or a sample, then run the check again.',
          },
        }
      }
      const report = reporter(onProgress)
      try {
        const start = performance.now()
        report('access', 0)
        const occluded = occluderFromBvh(wholeMesh(current).bvh)
        const results: Record<string, AccessAnalysis> = {}
        seams.forEach((seam, i) => {
          results[seam.id] = seamAccess(seam, occluded)
          report('access', (i + 1) / seams.length)
        })
        return { status: 'ok', results, ms: performance.now() - start }
      } catch (error) {
        return { status: 'error', error: toUserError(error) }
      }
    },

    async reach(seams, ports, arm, onProgress) {
      if (!current) {
        return {
          status: 'error',
          error: {
            what: 'There is no part to run the snake arm reach on.',
            why: 'The reach check keeps the arm off the surface of the part and none has been loaded in this session.',
            next: 'Choose an STL file or a sample, then run reach again.',
          },
        }
      }
      if (ports.length === 0) {
        return {
          status: 'error',
          error: {
            what: 'There is no access port to run the reach from.',
            why: 'The snake arm enters the part through a port, so without one nothing can be reached.',
            next: 'Add a port on the part where the arm can enter, then run reach again.',
          },
        }
      }
      const report = reporter(onProgress)
      try {
        const start = performance.now()
        report('reach', 0)
        const near = proximityFromBvh(wholeMesh(current).bvh)
        const results: Record<string, SeamReach> = {}
        const run = ++reachRun
        let gaveWay = performance.now()
        for (let i = 0; i < seams.length; i++) {
          const steps = seamReachSteps(seams[i]!, ports, arm, near)
          let next = steps.next()
          for (; !next.done; next = steps.next()) {
            report('reach', (i + next.value) / seams.length)
            if (performance.now() - gaveWay < GIVE_WAY_MS) continue
            await giveWay()
            gaveWay = performance.now()
            if (run !== reachRun) return { status: 'cancelled' }
          }
          results[seams[i]!.id] = next.value
          report('reach', (i + 1) / seams.length)
        }
        return { status: 'ok', results, ms: performance.now() - start }
      } catch (error) {
        return { status: 'error', error: toUserError(error) }
      }
    },

    async cancelReach() {
      reachRun++
    },

    async insertion(seam, s, port, arm, approachMm) {
      if (!current) {
        return {
          status: 'error',
          error: {
            what: 'There is no part to insert the arm into.',
            why: 'The insertion keeps the arm off the surface of the part and none has been loaded in this session.',
            next: 'Choose an STL file or a sample, then try again.',
          },
        }
      }
      try {
        const near = proximityFromBvh(wholeMesh(current).bvh)
        const poses = torchPoses(seam.points, seam.closed, DEFAULT_TORCH)
        const pose = poseAt(poses, s, seam.closed)
        const solved = solveArm(port, approachGoal(pose.p, rotate(pose.q, [0, 0, 1]), arm, approachMm), arm, near)
        if (!solved.ok) {
          return {
            status: 'error',
            error: {
              what: `The arm cannot reach seam ${seam.label} at ${Math.round(s)} mm from port ${port.id}.`,
              why: 'No chain of the arm gets the torch to its approach point there without touching the part or bending past its limit.',
              next: 'Pick a stretch that reach shows as reached, or move the port.',
            },
          }
        }
        return { status: 'ok', frames: insertArm(port, solved.chain, arm) }
      } catch (error) {
        return { status: 'error', error: toUserError(error) }
      }
    },

    async preflight(plan) {
      try {
        return { status: 'ok', issues: preflight(plan) }
      } catch (error) {
        return { status: 'error', error: toUserError(error) }
      }
    },

    async exportJob(plan, createdAt) {
      return exportJob(plan, { createdAt })
    },

    async optimiseSequence(plan, strategy, locked, current, onProgress) {
      try {
        const lockedIds = new Set(locked)
        const tableIds = plan.seams.map((p) => p.seam.id)
        const start = reconcileOrder(current, tableIds)
        let order = start
        if (strategy === 'table-order') {
          order = resetToTable(start.map((e) => ({ ...e, locked: lockedIds.has(e.seamId) })), tableIds).map(({ seamId, reversed }) => ({ seamId, reversed }))
        } else if (strategy !== 'manual' && start.length > 0) {
          const nodes = nodesFromPlan(plan, lockedIds)
          const byId = new Map(nodes.map((node) => [node.id, node]))
          const visits: Visit[] = start.map((e) => ({ node: byId.get(e.seamId)!, reversed: e.reversed && !byId.get(e.seamId)!.closed }))
          const home = homePoint(plan)
          const lead = plan.settings.approachMm
          const edge = strategy === 'balanced-heat' ? balancedEdge(nodes, home, lead) : airEdge(home, lead)
          order = optimise(nodes, edge, { start: visits, onProgress: quietly(onProgress) }).map((v) => ({ seamId: v.node.id, reversed: v.reversed }))
        }
        const timing = planTiming({ ...plan, sequence: { strategy, order } })
        return { status: 'ok', order, moves: timing.moves }
      } catch (error) {
        return { status: 'error', error: toUserError(error) }
      }
    },

    async playbackPath(plan) {
      try {
        return { status: 'ok', path: playbackPathOf(plan), timing: planTiming(plan) }
      } catch (error) {
        return { status: 'error', error: toUserError(error) }
      }
    },

    async planTiming(plan) {
      try {
        return { status: 'ok', timing: planTiming(plan) }
      } catch (error) {
        return { status: 'error', error: toUserError(error) }
      }
    },
  }
}
