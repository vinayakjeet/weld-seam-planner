export type Vec3 = [number, number, number]

// The top and bottom cameras lean a hair towards y: looking straight along the up axis has no defined screen up, and
// this keeps +y at the top of the screen in both.
const LEAN = 0.001
const TOP_BOTTOM_NORM = Math.hypot(LEAN, 1)

export interface StandardView {
  label: string
  // From the part towards the camera, unit length.
  direction: Vec3
}

// Shift+1 to Shift+6. The front camera sits at -y, which is the side the view cube calls Front.
export const STANDARD_VIEWS: ReadonlyArray<StandardView> = [
  { label: 'Front', direction: [0, -1, 0] },
  { label: 'Back', direction: [0, 1, 0] },
  { label: 'Left', direction: [-1, 0, 0] },
  { label: 'Right', direction: [1, 0, 0] },
  { label: 'Top', direction: [0, -LEAN / TOP_BOTTOM_NORM, 1 / TOP_BOTTOM_NORM] },
  { label: 'Bottom', direction: [0, LEAN / TOP_BOTTOM_NORM, -1 / TOP_BOTTOM_NORM] },
]

export function viewEye(target: Vec3, distance: number, index: number): Vec3 {
  const [dx, dy, dz] = STANDARD_VIEWS[index]!.direction
  return [target[0] + dx * distance, target[1] + dy * distance, target[2] + dz * distance]
}
