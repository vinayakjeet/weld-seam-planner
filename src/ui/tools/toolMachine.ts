import type { Vec3 } from '../../core/math/vec3'
import type { DrawClick } from '../../core/seams/draw'
import type { ManualError } from '../../core/seams/manual'
import { fewPoints, needSeamSelected } from '../panels/manualText'

export type ToolName = 'select' | 'draw' | 'split' | 'merge'

export type ToolState =
  | { tool: 'select' }
  | { tool: 'draw'; points: DrawClick[] }
  | { tool: 'split' }
  // from is the seam the merge started on; the next seam clicked is joined to it.
  | { tool: 'merge'; from: string }

export type ClickTarget =
  | { kind: 'surface'; point: DrawClick }
  | { kind: 'seam'; id: string; s: number }

export type ToolEvent =
  | { type: 'choose'; tool: ToolName; selectedId: string | null }
  | { type: 'click'; target: ClickTarget }
  | { type: 'finish' }
  | { type: 'cancel' }
  | { type: 'undoPoint' }
  // The effect the machine asked for worked; the tool is finished.
  | { type: 'done' }

// What the caller has to do. The machine stays armed until it hears done, so a refused effect can be tried again.
export type ToolEffect =
  | { kind: 'draw'; clicks: DrawClick[] }
  | { kind: 'split'; id: string; s: number }
  | { kind: 'merge'; a: string; b: string }
  | { kind: 'refuse'; error: ManualError }

export interface ToolStep {
  state: ToolState
  effect: ToolEffect | null
}

export const initialTool: ToolState = { tool: 'select' }

// A double click delivers its second click on the same point; a real next point is further than this.
const SAME_POINT_MM = 1e-6

const same = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < SAME_POINT_MM

function choose(state: ToolState, tool: ToolName, selectedId: string | null): ToolStep {
  if (tool === 'select' || tool === state.tool) return { state: initialTool, effect: null }
  if (tool === 'draw') return { state: { tool: 'draw', points: [] }, effect: null }
  if (selectedId === null) return { state: initialTool, effect: { kind: 'refuse', error: needSeamSelected(tool) } }
  return { state: tool === 'split' ? { tool: 'split' } : { tool: 'merge', from: selectedId }, effect: null }
}

export function reduceTool(state: ToolState, event: ToolEvent): ToolStep {
  const idle: ToolStep = { state, effect: null }
  if (event.type === 'choose') return choose(state, event.tool, event.selectedId)
  if (state.tool === 'select') return idle
  if (event.type === 'done') return { state: initialTool, effect: null }
  if (event.type === 'cancel') {
    if (state.tool === 'draw' && state.points.length > 0) return { state: { tool: 'draw', points: [] }, effect: null }
    return { state: initialTool, effect: null }
  }

  if (state.tool === 'draw') {
    if (event.type === 'click' && event.target.kind === 'surface') {
      const last = state.points[state.points.length - 1]
      if (last && same(last.p, event.target.point.p)) return idle
      return { state: { tool: 'draw', points: [...state.points, event.target.point] }, effect: null }
    }
    if (event.type === 'undoPoint') return { state: { tool: 'draw', points: state.points.slice(0, -1) }, effect: null }
    if (event.type === 'finish') {
      if (state.points.length < 2) return { state, effect: { kind: 'refuse', error: fewPoints(state.points.length) } }
      return { state, effect: { kind: 'draw', clicks: state.points } }
    }
    return idle
  }

  if (event.type === 'click' && event.target.kind === 'seam') {
    if (state.tool === 'split') return { state, effect: { kind: 'split', id: event.target.id, s: event.target.s } }
    return { state, effect: { kind: 'merge', a: state.from, b: event.target.id } }
  }
  return idle
}
