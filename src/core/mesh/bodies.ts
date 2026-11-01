export interface BodyLabels {
  triangleBody: Uint32Array
  count: number
}

// Union-find over vertices: triangles that share a welded vertex belong to the same body.
// Solids that touch at a vertex position fuse into one body.
export function labelBodies(indices: Uint32Array, vertexCount: number): BodyLabels {
  const parent = new Uint32Array(vertexCount)
  for (let v = 0; v < vertexCount; v++) parent[v] = v

  const find = (v: number): number => {
    while (parent[v] !== v) {
      parent[v] = parent[parent[v]!]!
      v = parent[v]!
    }
    return v
  }

  const triangleCount = indices.length / 3
  for (let t = 0; t < triangleCount; t++) {
    const root = find(indices[t * 3]!)
    for (let k = 1; k < 3; k++) parent[find(indices[t * 3 + k]!)] = root
  }

  const label = new Int32Array(vertexCount).fill(-1)
  const triangleBody = new Uint32Array(triangleCount)
  let count = 0
  for (let t = 0; t < triangleCount; t++) {
    const root = find(indices[t * 3]!)
    if (label[root] === -1) label[root] = count++
    triangleBody[t] = label[root]!
  }
  return { triangleBody, count }
}
