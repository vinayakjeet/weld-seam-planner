import { useEffect, useMemo } from 'react'
import type { Vec3 } from '../../core/math/vec3'
import { toLocalArray } from '../../core/mesh/displayOrigin'
import { Color } from 'three'
import { cssVar } from './cssVar'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'

interface LineStyle {
  width: number
  colors?: Float32Array
  color?: string
  renderOrder?: number
  dashed?: { dashSize: number; gapSize: number }
  // Drawn over the part instead of behind it, for a path that runs through the inside of the model.
  overlay?: boolean
  // Below 1 the line is drawn see-through.
  opacity?: number
  // World positions are drawn relative to this point (the scene's display origin); positions already relative leave it out.
  origin?: Vec3
}

// Steps towards the camera that the lowest layer of lines gets over the part, which is itself pushed back by two.
const LINE_OFFSET = 4

export function lineSet(positions: Float32Array, { width, colors, color, renderOrder = 0, dashed, overlay = false, opacity = 1, origin }: LineStyle): LineSegments2 {
  const geometry = new LineSegmentsGeometry()
  geometry.setPositions(origin ? toLocalArray(positions, origin) : positions)
  if (colors) geometry.setColors(colors)
  // Every line is drawn in the transparent pass, which is ordered by renderOrder alone: a halo or an edge line is always
  // drawn before the line over it and writes no depth, so none of them can win a depth tie against the line they sit under.
  const material = new LineMaterial({ linewidth: width, vertexColors: colors !== undefined, transparent: true })
  if (color) material.color = new Color(color)
  material.opacity = opacity
  if (overlay) material.depthTest = false
  if (dashed) {
    material.dashed = true
    material.dashSize = dashed.dashSize
    material.gapSize = dashed.gapSize
  }
  // A line on a crease lies exactly where two faces meet, and a face sloping towards the camera would cut it into dashes.
  // The lift grows with the layer, so an overlay on a line set below it does not fight it over the depth test either.
  material.polygonOffset = true
  material.polygonOffsetFactor = -(LINE_OFFSET + renderOrder)
  material.polygonOffsetUnits = -(LINE_OFFSET + renderOrder)
  const lines = new LineSegments2(geometry, material)
  if (dashed) lines.computeLineDistances()
  lines.frustumCulled = false
  lines.renderOrder = renderOrder
  return lines
}

export function useDisposed(lines: LineSegments2 | null): void {
  useEffect(
    () => () => {
      if (!lines) return
      lines.geometry.dispose()
      lines.material.dispose()
    },
    [lines],
  )
}

interface Halo {
  color: string
  // Total width added to the line, split evenly over both sides.
  extraPx: number
}

// 1.5 px on each side of the line, and see-through, so the line itself stays the dominant colour.
export const HALO_EXTRA_PX = 3
export const HALO_OPACITY = 0.6

// A wider line in the halo colour drawn just under another one, so the line reads on a light part. It shares the line's
// geometry and follows its opacity and depth settings; the material is its own.
export function haloFor(lines: LineSegments2, { color, extraPx }: Halo): LineSegments2 {
  const material = new LineMaterial({ linewidth: lines.material.linewidth + extraPx })
  material.color = new Color(color)
  material.transparent = true
  material.opacity = HALO_OPACITY * lines.material.opacity
  material.depthTest = lines.material.depthTest
  // The line sits a whole step nearer the camera than its halo (half a step is below what the depth buffer can tell apart,
  // and the two speckle), and the halo writes no depth, so it can never hide the line.
  material.depthWrite = false
  material.polygonOffset = true
  material.polygonOffsetFactor = lines.material.polygonOffsetFactor + 1
  material.polygonOffsetUnits = lines.material.polygonOffsetUnits + 1
  const halo = new LineSegments2(lines.geometry, material)
  halo.frustumCulled = false
  halo.renderOrder = lines.renderOrder - 1
  return halo
}

// The halo for a line set, freed when the line set changes. The geometry belongs to the line set, so only the material goes.
export function useHalo(lines: LineSegments2 | null): LineSegments2 | null {
  const halo = useMemo(() => (lines ? haloFor(lines, { color: cssVar('--halo'), extraPx: HALO_EXTRA_PX }) : null), [lines])
  useEffect(() => () => halo?.material.dispose(), [halo])
  return halo
}
