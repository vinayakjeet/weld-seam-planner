import type { Vec3 } from '../core/math/vec3'

// The one sample the demo link is defined for, and what the demo does to it.
export const DEMO_SAMPLE = 'tank-with-manhole'
export const DEMO_PROCEDURE = 'WPS-GMAW-SPRAY-FW6'
// The manhole roof, pointing the arm straight down into the tank.
export const DEMO_PORT: { position: Vec3; direction: Vec3 } = { position: [400, 500, 1000], direction: [0, 0, -1] }
// Seam S16, on the manhole side face of the stiffener at x 746, and a station along it that the arm reaches.
export const DEMO_SEAM_ID = 'contact-546fbaba'
export const DEMO_STATION_MM = 630.7
