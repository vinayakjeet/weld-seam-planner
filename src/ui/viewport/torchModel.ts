import { rotate, type Quat } from '../../core/math/quat'
import { length, scale, sub, type Vec3 } from '../../core/math/vec3'

// Nozzle tip to the work when the procedure has no contact tip distance. Otherwise the distance is the procedure's.
export const DISPLAY_CTWD_MM = 15
const NOZZLE_LENGTH_MM = 22
const BODY_LENGTH_MM = 70
const WIRE_RADIUS_MM = 0.6
const NOZZLE_TIP_RADIUS_MM = 5
const NOZZLE_BASE_RADIUS_MM = 8
const BODY_RADIUS_MM = 8
// A pose that comes out of the torch maths is a unit quaternion to far better than this.
const UNIT_TOLERANCE = 1e-3

// One tapered cylinder on the tool axis. The tip is the end nearer the joint.
export interface TorchPart {
  tip: Vec3
  base: Vec3
  tipRadius: number
  baseRadius: number
}

export interface TorchPlacement {
  wire: TorchPart
  nozzle: TorchPart
  body: TorchPart
}

const finite = (values: readonly number[]) => values.every(Number.isFinite)

// The torch laid out along the tool axis of a pose: the wire runs from the nozzle tip to the seam point, the nozzle and
// the body sit behind it, away from the joint. displayScale grows or shrinks every dimension. Null when the pose or the
// scale cannot be drawn, so the caller shows nothing rather than a torch in the wrong place.
export function placeTorch(pose: { p: Vec3; q: Quat }, displayScale = 1, ctwdMm?: number | null): TorchPlacement | null {
  if (!finite([...pose.p, ...pose.q]) || !Number.isFinite(displayScale) || displayScale <= 0) return null
  if (Math.abs(Math.hypot(...pose.q) - 1) > UNIT_TOLERANCE) return null
  const z = rotate(pose.q, [0, 0, 1])
  if (!finite(z) || length(z) === 0) return null

  const back = (mm: number): Vec3 => sub(pose.p, scale(z, mm * displayScale))
  const ctwd = ctwdMm !== null && ctwdMm !== undefined && Number.isFinite(ctwdMm) && ctwdMm > 0 ? ctwdMm : DISPLAY_CTWD_MM
  const nozzleTip = back(ctwd)
  const bodyTip = back(ctwd + NOZZLE_LENGTH_MM)
  const s = displayScale
  return {
    wire: { tip: [...pose.p], base: nozzleTip, tipRadius: WIRE_RADIUS_MM * s, baseRadius: WIRE_RADIUS_MM * s },
    nozzle: { tip: nozzleTip, base: bodyTip, tipRadius: NOZZLE_TIP_RADIUS_MM * s, baseRadius: NOZZLE_BASE_RADIUS_MM * s },
    body: { tip: bodyTip, base: back(ctwd + NOZZLE_LENGTH_MM + BODY_LENGTH_MM), tipRadius: BODY_RADIUS_MM * s, baseRadius: BODY_RADIUS_MM * s },
  }
}
