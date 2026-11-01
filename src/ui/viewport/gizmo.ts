// Where the view cube sits, so a click on it is not also read as a click on a seam drawn behind it.
export const GIZMO_MARGIN = 72
export const GIZMO_RADIUS = 56

// x and y are pixels from the top left of the canvas.
export function overGizmo(x: number, y: number, canvasWidth: number): boolean {
  return Math.hypot(x - (canvasWidth - GIZMO_MARGIN), y - GIZMO_MARGIN) <= GIZMO_RADIUS
}
