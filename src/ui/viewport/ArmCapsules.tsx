import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CylinderGeometry, InstancedMesh, Object3D, Quaternion, SphereGeometry, Vector3 } from 'three'
import type { Vec3 } from '../../core/math/vec3'
import { reachFor, stationAt } from '../../state/reachSlice'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { armTorch } from './armTorch'
import { cssVar } from './cssVar'

const MAX_LINKS = 64
// The torch is drawn as a rod this share of the arm's radius, in the accent colour, so it reads apart from the links.
const TORCH_RADIUS_SHARE = 0.35
const UP = new Vector3(0, 1, 0)

// The joints to draw: the frame of a shown insertion, or else the chain reach found for the station nearest the scrub
// position of the selected seam.
function useJoints(): Vec3[] | null {
  const insertion = useStore((s) => s.insertionState)
  const selectedId = useStore((s) => s.selectedId)
  const scrubS = useStore((s) => s.scrubS)
  const reachById = useStore((s) => s.reachById)
  const reachPointsById = useStore((s) => s.reachPointsById)
  const reachKeyById = useStore((s) => s.reachKeyById)
  const ports = useStore((s) => s.ports)
  const arm = useStore((s) => s.arm)
  const seam = useVisibleSeams().find((s) => s.id === selectedId)
  return useMemo(() => {
    if (insertion && insertion.seamId === selectedId) return insertion.frames[insertion.frame]?.joints ?? null
    const reach = seam ? reachFor({ reachById, reachPointsById, reachKeyById, ports, arm }, seam) : null
    return (reach && stationAt(reach, scrubS)?.chain?.joints) || null
  }, [insertion, selectedId, seam, scrubS, reachById, reachPointsById, reachKeyById, ports, arm])
}

// One cylinder per link and one sphere per joint, so the chain reads as capsules of the arm's diameter. Each part is
// one instanced mesh, set from the joints without creating objects per frame.
export function ArmCapsules() {
  const active = useStore((s) => s.activeStep === 'access')
  const radius = useStore((s) => s.arm.diameterMm / 2)
  const torchLengthMm = useStore((s) => s.arm.torchLengthMm)
  const joints = useJoints()
  const torch = useMemo(() => (joints ? armTorch(joints, torchLengthMm) : null), [joints, torchLengthMm])
  const torchColor = useMemo(() => cssVar('--brand-accent'), [])
  const torchPlacement = useMemo(() => {
    if (!torch) return null
    const a = new Vector3(...torch.from)
    const b = new Vector3(...torch.to)
    const direction = new Vector3().subVectors(b, a)
    const length = direction.length()
    return {
      position: a.add(b).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(UP, direction.divideScalar(length)),
      length,
    }
  }, [torch])
  const gl = useThree((state) => state.gl)
  const links = useRef<InstancedMesh>(null)
  const balls = useRef<InstancedMesh>(null)
  const color = useMemo(() => cssVar('--access-snake'), [])
  const dummy = useMemo(() => new Object3D(), [])
  const cylinder = useMemo(() => new CylinderGeometry(1, 1, 1, 16, 1, true), [])
  const sphere = useMemo(() => new SphereGeometry(1, 16, 12), [])
  useEffect(
    () => () => {
      cylinder.dispose()
      sphere.dispose()
    },
    [cylinder, sphere],
  )

  useEffect(() => {
    const body = links.current
    const joint = balls.current
    if (!body || !joint) return
    const points = joints && active ? joints.slice(0, MAX_LINKS + 1) : []
    const direction = new Vector3()
    const quaternion = new Quaternion()
    for (let i = 0; i + 1 < points.length; i++) {
      const a = new Vector3(...points[i]!)
      const b = new Vector3(...points[i + 1]!)
      direction.subVectors(b, a)
      const length = direction.length()
      dummy.position.addVectors(a, b).multiplyScalar(0.5)
      dummy.quaternion.copy(length > 1e-9 ? quaternion.setFromUnitVectors(UP, direction.divideScalar(length)) : quaternion.identity())
      dummy.scale.set(radius, Math.max(length, 1e-6), radius)
      dummy.updateMatrix()
      body.setMatrixAt(i, dummy.matrix)
    }
    body.count = Math.max(0, points.length - 1)
    body.instanceMatrix.needsUpdate = true
    for (let i = 0; i < points.length; i++) {
      dummy.position.set(...points[i]!)
      dummy.quaternion.identity()
      dummy.scale.setScalar(radius)
      dummy.updateMatrix()
      joint.setMatrixAt(i, dummy.matrix)
    }
    joint.count = points.length
    joint.instanceMatrix.needsUpdate = true
    // Written on the viewport for the end to end tests, which cannot read the instanced mesh.
    const main = gl.domElement.closest('main')
    main?.setAttribute('data-arm-links', String(Math.max(0, points.length - 1)))
    main?.setAttribute('data-arm-torch', active && torch ? String(Math.round(torchLengthMm)) : '0')
  }, [joints, active, radius, dummy, gl, torch, torchLengthMm])

  return (
    <>
      <instancedMesh ref={links} args={[cylinder, undefined, MAX_LINKS]} frustumCulled={false} visible={active && joints !== null}>
        <meshStandardMaterial color={color} roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={balls} args={[sphere, undefined, MAX_LINKS + 1]} frustumCulled={false} visible={active && joints !== null}>
        <meshStandardMaterial color={color} roughness={0.6} />
      </instancedMesh>
      {active && torchPlacement && (
        <mesh
          geometry={cylinder}
          position={torchPlacement.position}
          quaternion={torchPlacement.quaternion}
          scale={[radius * TORCH_RADIUS_SHARE, torchPlacement.length, radius * TORCH_RADIUS_SHARE]}
        >
          <meshStandardMaterial color={torchColor} roughness={0.4} />
        </mesh>
      )}
    </>
  )
}
