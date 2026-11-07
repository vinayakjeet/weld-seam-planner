import { STANDARD_VIEWS, type Vec3 } from './standardViews'

// The faces of a three.js box in its material order, with where each face's texture right (u) and up (v) point. A
// canvas texture keeps the canvas top at v = 1, so a label drawn on the canvas reads along these two directions.
export const BOX_FACES: ReadonlyArray<{ normal: Vec3; right: Vec3; up: Vec3 }> = [
  { normal: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] },
  { normal: [-1, 0, 0], right: [0, 0, 1], up: [0, 1, 0] },
  { normal: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1] },
  { normal: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1] },
  { normal: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] },
  { normal: [0, 0, -1], right: [-1, 0, 0], up: [0, 1, 0] },
]

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(...a)
  return [a[0] / n, a[1] / n, a[2] / n]
}

// The screen right and up of a camera that looks back along direction (from the part towards the camera) with +z as its
// up hint, as the camera controls set it.
export function screenAxes(direction: Vec3, upHint: Vec3 = [0, 0, 1]): { right: Vec3; up: Vec3 } {
  const forward: Vec3 = unit([-direction[0], -direction[1], -direction[2]])
  const right = unit(cross(forward, upHint))
  return { right, up: cross(right, forward) }
}

export interface CubeFace {
  label: string
  // Counterclockwise turn of the face texture, in radians, so that the label reads upright in its standard view.
  rotation: number
}

// The world is z up, but a box lays its face textures out for y up: the side labels would lie on their side or upside
// down. Each face takes the label of the standard view that looks at it and turns until it reads as that view shows it.
export const CUBE_FACES: ReadonlyArray<CubeFace> = BOX_FACES.map((face) => {
  const view = STANDARD_VIEWS.find((v) => dot(unit(v.direction), face.normal) > 0.99)!
  const { right } = screenAxes(view.direction)
  return { label: view.label, rotation: Math.atan2(dot(right, face.up), dot(right, face.right)) }
})
