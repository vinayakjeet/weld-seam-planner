import { useEffect, useMemo } from 'react'
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
}

export function lineSet(positions: Float32Array, { width, colors, color, renderOrder = 0, dashed, overlay = false, opacity = 1 }: LineStyle): LineSegments2 {
  const geometry = new LineSegmentsGeometry()
  geometry.setPositions(positions)
  if (colors) geometry.setColors(colors)
  const material = new LineMaterial({ linewidth: width, vertexColors: colors !== undefined })
  if (color) material.color = new Color(color)
  if (opacity < 1) {
    material.transparent = true
    material.opacity = opacity
  }
  if (overlay) {
    material.depthTest = false
    material.transparent = true
  }
  if (dashed) {
    material.dashed = true
    material.dashSize = dashed.dashSize
    material.gapSize = dashed.gapSize
  }
  // An overlay lies exactly on the line set below it; without a lift the two fight over the depth test and speckle.
  if (renderOrder > 0) {
    material.polygonOffset = true
    material.polygonOffsetFactor = -renderOrder
    material.polygonOffsetUnits = -renderOrder
  }
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

export const HALO_EXTRA_PX = 4

// A wider line in the halo colour drawn just under another one, so the line reads on a light part. It shares the line's
// geometry and follows its opacity and depth settings; the material is its own.
export function haloFor(lines: LineSegments2, { color, extraPx }: Halo): LineSegments2 {
  const material = new LineMaterial({ linewidth: lines.material.linewidth + extraPx })
  material.color = new Color(color)
  material.transparent = lines.material.transparent
  material.opacity = lines.material.opacity
  material.depthTest = lines.material.depthTest
  // The line sits half a step nearer the camera than its halo, so the two do not fight over the depth test.
  if (lines.material.polygonOffset) {
    material.polygonOffset = true
    material.polygonOffsetFactor = lines.material.polygonOffsetFactor + 0.5
    material.polygonOffsetUnits = lines.material.polygonOffsetUnits + 0.5
  }
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
