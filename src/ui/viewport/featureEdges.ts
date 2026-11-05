import { EdgesGeometry, type BufferGeometry } from 'three'

// Above this many triangles the edges are not drawn: finding them costs a pass over the mesh on the main thread.
export const EDGE_MAX_TRIANGLES = 400000

export const edgesAllowed = (triangles: number): boolean => triangles <= EDGE_MAX_TRIANGLES

// Start and end of every edge where two faces meet at more than the threshold, and every boundary edge, as the 6 floats
// per segment a line set takes.
export function featureEdgePositions(geometry: BufferGeometry, thresholdDeg: number): Float32Array {
  const edges = new EdgesGeometry(geometry, thresholdDeg)
  const positions = Float32Array.from(edges.getAttribute('position').array)
  edges.dispose()
  return positions
}
