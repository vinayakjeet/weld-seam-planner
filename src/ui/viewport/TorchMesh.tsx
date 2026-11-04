import { useMemo } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { Quat } from '../../core/math/quat'
import type { Vec3 } from '../../core/math/vec3'
import { useStore } from '../../state/store'
import { cssVar } from './cssVar'
import { placeTorch, type TorchPart } from './torchModel'

// The torch is drawn about this big for a part this size; other parts scale it, within limits.
const REFERENCE_DIAGONAL_MM = 300
const MIN_SCALE = 0.25
const MAX_SCALE = 6
const SEGMENTS = 24

// Cylinders run along Y; the tool axis is Z.
const Y_TO_Z = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)

function Part({ part, orientation, color, metalness = 0.4 }: { part: TorchPart; orientation: Quaternion; color: string; metalness?: number }) {
  const middle = useMemo(() => new Vector3(...part.tip).add(new Vector3(...part.base)).multiplyScalar(0.5), [part])
  const height = new Vector3(...part.tip).distanceTo(new Vector3(...part.base))
  return (
    <mesh position={middle} quaternion={orientation}>
      <cylinderGeometry args={[part.tipRadius, part.baseRadius, height, SEGMENTS]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={0.45} />
    </mesh>
  )
}

// How big the torch is drawn for the loaded part.
export function useTorchScale(): number {
  const bbox = useStore((s) => s.part?.bbox)
  return useMemo(() => {
    if (!bbox) return 1
    const diagonal = Math.hypot(bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2])
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, diagonal / REFERENCE_DIAGONAL_MM))
  }, [bbox])
}

// The torch in a pose. Nothing is drawn when the pose is one that cannot be drawn.
export function TorchMesh({ pose, name }: { pose: { p: Vec3; q: Quat }; name: string }) {
  const scale = useTorchScale()
  const placed = useMemo(() => placeTorch(pose, scale), [pose, scale])
  const orientation = useMemo(() => new Quaternion(...pose.q).multiply(Y_TO_Z), [pose])
  const colors = useMemo(() => ({ body: cssVar('--text-1'), nozzle: cssVar('--brand-accent'), wire: cssVar('--ok') }), [])
  if (!placed) return null
  return (
    <group name={name}>
      <Part part={placed.body} orientation={orientation} color={colors.body} />
      <Part part={placed.nozzle} orientation={orientation} color={colors.nozzle} metalness={0.7} />
      <Part part={placed.wire} orientation={orientation} color={colors.wire} metalness={0} />
    </group>
  )
}
