// What a mesh import should tell the user about the file. Counts come from the loaded part; this module only words them.
export interface MeshHealth {
  boundaryEdges: number
  nonManifoldEdges: number
  reorientedBodies: number
  unsignedBodies: number
}

export interface MeshWarning {
  code: 'open-mesh' | 'non-manifold' | 'reoriented' | 'concavity-unknown'
  severity: 'info' | 'warn'
  what: string
  why: string
  next: string
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function meshWarnings(health: MeshHealth): MeshWarning[] {
  const warnings: MeshWarning[] = []
  if (health.boundaryEdges > 0) {
    warnings.push({
      code: 'open-mesh',
      severity: 'warn',
      what: `The mesh is open: ${count(health.boundaryEdges, 'boundary edge has', 'boundary edges have')} only one triangle.`,
      why: 'A closed solid has two triangles on every edge, so this part has holes or is a single surface. Boundary edges are never offered as seams.',
      next: 'Close the holes in your CAD tool and export again, or add the missing seams by hand.',
    })
  }
  if (health.nonManifoldEdges > 0) {
    warnings.push({
      code: 'non-manifold',
      severity: 'warn',
      what: `${count(health.nonManifoldEdges, 'edge is', 'edges are')} shared by three or more triangles.`,
      why: 'This usually marks where an exporter fused two touching parts. Each such edge is offered as a seam candidate, and a body that contains one has no known inside.',
      next: 'Check these candidates, or export the parts as separate bodies.',
    })
  }
  if (health.reorientedBodies > 0) {
    warnings.push({
      code: 'reoriented',
      severity: 'info',
      what: `The winding of ${count(health.reorientedBodies, 'body was', 'bodies were')} reversed so that its normals point outward.`,
      why: 'Some triangles faced inward, which would read inside corners as outside corners.',
      next: 'No action is needed. If seams still look wrong, check the normals in your CAD tool.',
    })
  }
  if (health.unsignedBodies > 0) {
    warnings.push({
      code: 'concavity-unknown',
      severity: 'warn',
      what: `${count(health.unsignedBodies, 'body has', 'bodies have')} no known inside.`,
      why: 'Open or non-manifold bodies do not say which side of a surface is solid, so a seam may be an outside corner instead of a fillet.',
      next: 'Review the seams on these bodies and set the joint type by hand.',
    })
  }
  return warnings
}
