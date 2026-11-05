import { describe, expect, it } from 'vitest'
import { add, dot, length, scale, sub, type Vec3 } from '../../../src/core/math/vec3'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { buildEdgeIndex, nearestEdge } from '../../../src/core/seams/edgeIndex'
import { loadSampleModel } from '../helpers/models'
import { seededRandom } from '../helpers/random'
import { soupOf } from '../helpers/shapes'

type Model = ReturnType<typeof loadSampleModel>

const point = (model: Model, v: number): Vec3 => [model.mesh.positions[v * 3]!, model.mesh.positions[v * 3 + 1]!, model.mesh.positions[v * 3 + 2]!]

// The scan the index replaces: every edge, the nearest within the radius, a later edge on a tie.
function scan(model: Model, edges: Uint32Array, p: Vec3, radius: number) {
  let best: { point: Vec3; edge: number } | null = null
  let bestDistance = radius
  for (const e of edges) {
    const a = point(model, model.edges.edgeA[e]!)
    const ab = sub(point(model, model.edges.edgeB[e]!), a)
    const u = Math.min(1, Math.max(0, dot(sub(p, a), ab) / dot(ab, ab)))
    const at = add(a, scale(ab, u))
    const d = length(sub(p, at))
    if (d <= bestDistance) {
      bestDistance = d
      best = { point: at, edge: e }
    }
  }
  return best
}

const allEdges = (model: Model) => Uint32Array.from({ length: model.edges.edgeCount }, (_, e) => e)

describe('nearestEdge', () => {
  it('gives the same edge and point as scanning every edge, on every sample', () => {
    const random = seededRandom(7)
    for (const id of ['t-joint-merged', 'pipe-on-plate', 'tank-with-manhole', 'l-bracket-gussets']) {
      const model = loadSampleModel(id)
      const edges = allEdges(model)
      const index = buildEdgeIndex(model, edges)
      const { min, max } = model.bounds
      for (let k = 0; k < 300; k++) {
        const p = [0, 1, 2].map((c) => min[c]! + random() * (max[c]! - min[c]!)) as Vec3
        const radius = 1 + random() * 0.05 * model.bounds.diagonal
        expect(nearestEdge(index, p, radius), `${id} ${k}`).toEqual(scan(model, edges, p, radius))
      }
    }
  })

  // A sheet folded at every row: 250000 crease edges, each a feature.
  it('answers a thousand clicks on 250000 feature edges in a fraction of the time of one scan each', () => {
    const rows = 500
    const columns = 500
    const tris: number[][] = []
    const at = (i: number, j: number) => [i * 2, j * 2, j % 2 === 0 ? 0 : 2]
    for (let i = 0; i < columns; i++) {
      for (let j = 0; j < rows; j++) {
        const [a, b, c, d] = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]
        tris.push([...a!, ...b!, ...c!], [...a!, ...c!, ...d!])
      }
    }
    const model = buildMeshModel(soupOf(tris), 1)
    const edges = allEdges(model)
    const index = buildEdgeIndex(model, edges)
    const random = seededRandom(3)
    const clicks = Array.from({ length: 1000 }, (): Vec3 => [random() * 1000, random() * 1000, random() * 2])
    let started = performance.now()
    const fast = clicks.map((p) => nearestEdge(index, p, 3))
    const indexed = performance.now() - started
    started = performance.now()
    const slow = clicks.slice(0, 20).map((p) => scan(model, edges, p, 3))
    const scanned = ((performance.now() - started) / 20) * 1000
    expect(fast.slice(0, 20)).toEqual(slow)
    expect(indexed * 20).toBeLessThan(scanned)
  }, 60_000)
})
