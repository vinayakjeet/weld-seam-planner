import { useEffect } from 'react'
import { Color } from 'three'
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
