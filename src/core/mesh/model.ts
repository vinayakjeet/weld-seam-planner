import { labelBodies, type BodyLabels } from './bodies'
import { computeBounds, type Bounds } from './bounds'
import { buildEdgeMap, type EdgeMap } from './edgeMap'
import { orientBodies, type Orientation } from './orient'
import { StlError } from './parseStl'
import { weldVertices, type IndexedMesh } from './weld'

export interface MeshModel {
  mesh: IndexedMesh
  bounds: Bounds
  edges: EdgeMap
  bodies: BodyLabels
  // mesh.indices already carry the repaired winding.
  orientation: Orientation
  droppedDegenerate: number
}

export type ModelStage = 'weld' | 'topology'

// soup is the parsed triangle soup in file units; scaleToMm converts it before anything is measured.
// onStage fires before each slow step so a caller can show honest progress.
export function buildMeshModel(soup: Float32Array, scaleToMm: number, onStage?: (stage: ModelStage) => void): MeshModel {
  onStage?.('weld')
  const scaled = scaleToMm === 1 ? soup : soup.map((x) => x * scaleToMm)
  const { mesh, droppedDegenerate } = weldVertices(scaled)
  if (mesh.triangleCount === 0) {
    throw new StlError(
      'no-valid-triangles',
      'The file has no usable triangles.',
      `All ${soup.length / 9} triangles collapse to a point or a line once touching vertices are welded, so there is no surface to weld.`,
      'Check the part for zero thickness geometry in your CAD tool, then export it again.',
    )
  }
  onStage?.('topology')
  const edges = buildEdgeMap(mesh.indices, mesh.vertexCount)
  const bodies = labelBodies(mesh.indices, mesh.vertexCount)
  const { indices, ...orientation } = orientBodies(mesh, bodies, edges)
  return {
    mesh: indices === mesh.indices ? mesh : { ...mesh, indices },
    bounds: computeBounds(mesh.positions),
    edges,
    bodies,
    orientation,
    droppedDegenerate,
  }
}
