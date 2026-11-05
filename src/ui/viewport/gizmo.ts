// Where the view cube sits, so a click on it is not also read as a click on a seam drawn behind it.
export const GIZMO_MARGIN = 72
export const GIZMO_RADIUS = 56

// The distance of the cube's centre from the top and right edges: the usual margin, pulled in on a canvas too small for it
// and never less than the cube's own radius.
export function gizmoMargin(canvasWidth: number, canvasHeight: number): number {
  return Math.max(GIZMO_RADIUS, Math.min(GIZMO_MARGIN, canvasWidth - GIZMO_RADIUS, canvasHeight - GIZMO_RADIUS))
}

// x and y are pixels from the top left of the canvas.
export function overGizmo(x: number, y: number, canvasWidth: number, canvasHeight: number): boolean {
  const margin = gizmoMargin(canvasWidth, canvasHeight)
  return Math.hypot(x - (canvasWidth - margin), y - margin) <= GIZMO_RADIUS
}
