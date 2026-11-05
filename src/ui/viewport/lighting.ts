import type { Vec3 } from '../../core/math/vec3'

export interface DirectionalSpec {
  // Where the light stands, relative to the part; only the direction counts.
  position: Vec3
  intensity: number
}

export interface LightRig {
  ambient: number
  key: DirectionalSpec
  fill: DirectionalSpec
}

// A soft key from above and in front, and a weaker, lower fill from the other side, tuned for the default view (z up, camera
// at +x, -y, +z) so the top, front and right faces of a box show at about 1.0, 0.75 and 0.55 of the brightest. Tone mapping is
// off on the canvas, so the brightest face shows the part colour as it is.
export const LIGHT_RIG: LightRig = {
  ambient: 0.4,
  key: { position: [-300, -449, 1000], intensity: 2.955 },
  fill: { position: [800, 300, -200], intensity: 0.422 },
}

const unit = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v)
  return [v[0] / length, v[1] / length, v[2] / length]
}
const lambert = (normal: Vec3, spec: DirectionalSpec) => spec.intensity * Math.max(0, normal[0] * unit(spec.position)[0] + normal[1] * unit(spec.position)[1] + normal[2] * unit(spec.position)[2])

// How much of the part colour a flat face with this unit normal shows, 1 being the colour itself. The lights are scaled so
// that a face lit with a total of pi shows the colour, which is how three.js turns light into diffuse reflection.
export function brightnessOf(normal: Vec3, rig: LightRig = LIGHT_RIG): number {
  return (rig.ambient + lambert(normal, rig.key) + lambert(normal, rig.fill)) / (Math.PI)
}

const encode = (linear: number) => (linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055)

// The same as brightnessOf after the screen's sRGB encoding: the lightness an eye compares between faces.
export function displayedBrightnessOf(normal: Vec3, rig: LightRig = LIGHT_RIG): number {
  return encode(Math.min(1, brightnessOf(normal, rig)))
}
