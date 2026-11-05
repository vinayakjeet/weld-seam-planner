export type CameraScale = { kind: 'perspective'; fovDeg: number } | { kind: 'ortho'; heightMm: number; zoom: number }

// How far the cursor must be from an edge, in screen pixels, for a drawn point to snap to it.
export const SNAP_RADIUS_PX = 10

// How many millimetres one screen pixel covers at a distance in front of the camera.
export function mmPerPixel(cam: CameraScale, distanceMm: number, viewportHeightPx: number): number {
  if (cam.kind === 'ortho') return cam.heightMm / cam.zoom / viewportHeightPx
  return (2 * distanceMm * Math.tan((cam.fovDeg * Math.PI) / 360)) / viewportHeightPx
}
