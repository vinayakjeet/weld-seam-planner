export interface SeamLineHit {
  // Index of the line segment that was hit, as the merged line set numbers them.
  segment: number
  // Distance from the camera to the hit point on the seam.
  distance: number
  // Distance from the camera to the first part surface on the way to that point; null when nothing is in the way.
  occluderDistance: number | null
}

// A seam is hidden when the part is in front of it by more than the tolerance. Seams sit on the surface, so a hit
// with the surface at about the same distance is the seam itself, not something covering it.
// Returns the index of the nearest visible seam, or null.
export function chooseSeamHit(hits: readonly SeamLineHit[], segmentSeam: ArrayLike<number>, tolerance: number): number | null {
  let best: SeamLineHit | null = null
  for (const hit of hits) {
    if (hit.occluderDistance !== null && hit.occluderDistance < hit.distance - tolerance) continue
    if (segmentSeam[hit.segment] === undefined) continue
    if (best === null || hit.distance < best.distance) best = hit
  }
  return best === null ? null : (segmentSeam[best.segment] ?? null)
}
