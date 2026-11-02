import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../../../src/core/math/vec3'
import { initialTool, reduceTool, type ToolEvent, type ToolState } from '../../../src/ui/tools/toolMachine'

const at = (x: number, y = 0) => ({ p: [x, y, 0] as Vec3, face: -1 })
const surface = (x: number, y = 0): ToolEvent => ({ type: 'click', target: { kind: 'surface', point: at(x, y) } })
const onSeam = (id: string, s: number): ToolEvent => ({ type: 'click', target: { kind: 'seam', id, s } })
const choose = (tool: 'select' | 'draw' | 'split' | 'merge', selectedId: string | null = null): ToolEvent => ({ type: 'choose', tool, selectedId })

function run(events: ToolEvent[], from: ToolState = initialTool) {
  let state = from
  let effect = null as ReturnType<typeof reduceTool>['effect']
  for (const event of events) ({ state, effect } = reduceTool(state, event))
  return { state, effect }
}

describe('toolMachine: choosing a tool', () => {
  it('starts on select', () => {
    expect(initialTool).toEqual({ tool: 'select' })
  })

  it('enters draw with no points, and choosing draw again goes back to select', () => {
    expect(run([choose('draw')]).state).toEqual({ tool: 'draw', points: [] })
    expect(run([choose('draw'), choose('draw')]).state).toEqual({ tool: 'select' })
  })

  it('throws away a half drawn line when another tool is chosen', () => {
    const { state } = run([choose('draw'), surface(0), surface(10), choose('split', 'a')])
    expect(state).toEqual({ tool: 'split' })
  })

  it('split and merge need a selected seam, and refuse with a readable message when there is none', () => {
    for (const tool of ['split', 'merge'] as const) {
      const { state, effect } = run([choose(tool, null)])
      expect(state).toEqual({ tool: 'select' })
      expect(effect?.kind).toBe('refuse')
      if (effect?.kind !== 'refuse') throw new Error('unreachable')
      for (const part of [effect.error.what, effect.error.why, effect.error.next]) expect(part.trim().length).toBeGreaterThan(0)
    }
  })

  it('merge remembers the seam it was started from', () => {
    expect(run([choose('merge', 'a')]).state).toEqual({ tool: 'merge', from: 'a' })
  })

  it('choosing select always returns to select', () => {
    expect(run([choose('merge', 'a'), choose('select')]).state).toEqual({ tool: 'select' })
  })
})

describe('toolMachine: draw', () => {
  it('collects surface clicks in order', () => {
    const { state, effect } = run([choose('draw'), surface(0), surface(10), surface(25)])
    expect(state).toEqual({ tool: 'draw', points: [at(0), at(10), at(25)] })
    expect(effect).toBeNull()
  })

  it('ignores the second click of a double click, which lands on the same point', () => {
    const { state } = run([choose('draw'), surface(0), surface(10), surface(10)])
    expect(state).toEqual({ tool: 'draw', points: [at(0), at(10)] })
  })

  it('removes the last point on undo-last-point, and does nothing with no points', () => {
    expect(run([choose('draw'), surface(0), surface(10), { type: 'undoPoint' }]).state).toEqual({ tool: 'draw', points: [at(0)] })
    expect(run([choose('draw'), { type: 'undoPoint' }]).state).toEqual({ tool: 'draw', points: [] })
  })

  it('finishes with two or more points by asking for a draw, and stays armed until the draw is done', () => {
    const { state, effect } = run([choose('draw'), surface(0), surface(10), { type: 'finish' }])
    expect(effect).toEqual({ kind: 'draw', clicks: [at(0), at(10)] })
    expect(state).toEqual({ tool: 'draw', points: [at(0), at(10)] })
    expect(run([{ type: 'done' }], state).state).toEqual({ tool: 'select' })
  })

  it('refuses to finish with fewer than two points and keeps the point', () => {
    const { state, effect } = run([choose('draw'), surface(0), { type: 'finish' }])
    expect(effect?.kind).toBe('refuse')
    expect(state).toEqual({ tool: 'draw', points: [at(0)] })
  })

  it('escape clears the points first, then leaves the tool', () => {
    const cleared = run([choose('draw'), surface(0), surface(10), { type: 'cancel' }])
    expect(cleared.state).toEqual({ tool: 'draw', points: [] })
    expect(run([{ type: 'cancel' }], cleared.state).state).toEqual({ tool: 'select' })
  })

  it('ignores clicks on a seam while drawing', () => {
    const { state, effect } = run([choose('draw'), onSeam('a', 5)])
    expect(state).toEqual({ tool: 'draw', points: [] })
    expect(effect).toBeNull()
  })
})

describe('toolMachine: split', () => {
  it('a click on the seam asks for a split at that arc length and stays armed until done', () => {
    const { state, effect } = run([choose('split', 'a'), onSeam('a', 80)])
    expect(effect).toEqual({ kind: 'split', id: 'a', s: 80 })
    expect(state).toEqual({ tool: 'split' })
    expect(run([{ type: 'done' }], state).state).toEqual({ tool: 'select' })
  })

  it('ignores clicks on the surface, finish and undo-last-point', () => {
    for (const event of [surface(0), { type: 'finish' } as const, { type: 'undoPoint' } as const]) {
      const { state, effect } = run([choose('split', 'a'), event])
      expect(state).toEqual({ tool: 'split' })
      expect(effect).toBeNull()
    }
  })

  it('escape leaves the tool', () => {
    expect(run([choose('split', 'a'), { type: 'cancel' }]).state).toEqual({ tool: 'select' })
  })
})

describe('toolMachine: merge', () => {
  it('a click on another seam asks for a merge of the two, in the order started then clicked', () => {
    const { state, effect } = run([choose('merge', 'a'), onSeam('b', 0)])
    expect(effect).toEqual({ kind: 'merge', a: 'a', b: 'b' })
    expect(state).toEqual({ tool: 'merge', from: 'a' })
  })

  it('ignores clicks on the surface', () => {
    const { state, effect } = run([choose('merge', 'a'), surface(3)])
    expect(state).toEqual({ tool: 'merge', from: 'a' })
    expect(effect).toBeNull()
  })

  it('escape leaves the tool', () => {
    expect(run([choose('merge', 'a'), { type: 'cancel' }]).state).toEqual({ tool: 'select' })
  })
})

describe('toolMachine: select', () => {
  it('ignores everything except choosing a tool', () => {
    for (const event of [surface(0), onSeam('a', 1), { type: 'finish' } as const, { type: 'cancel' } as const, { type: 'undoPoint' } as const, { type: 'done' } as const]) {
      const { state, effect } = run([event])
      expect(state).toEqual({ tool: 'select' })
      expect(effect).toBeNull()
    }
  })
})
