import { BoxGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { STANDARD_VIEWS, type Vec3 } from '../../../src/ui/viewport/standardViews'
import { BOX_FACES, CUBE_FACES, screenAxes } from '../../../src/ui/viewport/viewCubeFaces'

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const expectVec = (actual: Vec3, expected: Vec3, digits = 6) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, digits))

// Where the u and v of one face of a three.js box point, read from the geometry itself.
function uvAxes(geometry: BoxGeometry, materialIndex: number): { u: Vec3; v: Vec3 } {
  const group = geometry.groups.find((g) => g.materialIndex === materialIndex)!
  const index = geometry.index!
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  const corners = [...new Set(Array.from({ length: group.count }, (_, k) => index.getX(group.start + k)))]
  const at = (u: number, v: number) => corners.find((c) => uv.getX(c) === u && uv.getY(c) === v)!
  const p = (c: number): Vec3 => [position.getX(c), position.getY(c), position.getZ(c)]
  const o = p(at(0, 0))
  const pu = p(at(1, 0))
  const pv = p(at(0, 1))
  return { u: [pu[0] - o[0], pu[1] - o[1], pu[2] - o[2]], v: [pv[0] - o[0], pv[1] - o[1], pv[2] - o[2]] }
}

// The label's right and up on the face once its texture is turned by the face's rotation (counterclockwise in uv).
function labelAxes(face: { right: Vec3; up: Vec3 }, rotation: number): { right: Vec3; up: Vec3 } {
  const c = Math.cos(rotation)
  const s = Math.sin(rotation)
  const mix = (a: Vec3, b: Vec3, x: number, y: number): Vec3 => [a[0] * x + b[0] * y, a[1] * x + b[1] * y, a[2] * x + b[2] * y]
  return { right: mix(face.right, face.up, c, s), up: mix(face.right, face.up, -s, c) }
}

describe('BOX_FACES', () => {
  it('matches the uv layout three.js gives each face of a box, so a canvas label reads along right and up', () => {
    const geometry = new BoxGeometry()
    BOX_FACES.forEach((face, i) => {
      const { u, v } = uvAxes(geometry, i)
      expectVec(u, face.right)
      expectVec(v, face.up)
      const n = face.normal
      expect(dot(n, [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]])).toBeGreaterThan(0)
    })
  })
})

describe('CUBE_FACES', () => {
  it('names each face of the box after the standard view that looks at it', () => {
    expect(CUBE_FACES.map((face) => face.label)).toEqual(['Right', 'Left', 'Back', 'Front', 'Top', 'Bottom'])
  })

  it('turns every label upright and unmirrored in the standard view of its face, the way Shift+1 to Shift+6 show it', () => {
    CUBE_FACES.forEach((face, i) => {
      const view = STANDARD_VIEWS.find((v) => v.label === face.label)!
      const screen = screenAxes(view.direction)
      const label = labelAxes(BOX_FACES[i]!, face.rotation)
      // The top and bottom views lean a thousandth towards y, so their screen axes are off the box axes by that much.
      expectVec(label.right, screen.right, 2)
      expectVec(label.up, screen.up, 2)
    })
  })

  it('reads the side faces with +z up, so Back is turned half a turn and the left and right faces a quarter', () => {
    const turns = Object.fromEntries(CUBE_FACES.map((face) => [face.label, Math.round((face.rotation / Math.PI) * 2)]))
    expect(turns).toEqual({ Right: 1, Left: -1, Back: 2, Front: 0, Top: 0, Bottom: 0 })
  })
})

describe('screenAxes', () => {
  it('gives the screen right and up of a camera that keeps +z up', () => {
    const front = screenAxes([0, -1, 0])
    expectVec(front.right, [1, 0, 0])
    expectVec(front.up, [0, 0, 1])
  })
})
