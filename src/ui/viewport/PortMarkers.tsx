import { TransformControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { DoubleSide, Quaternion, Vector3, type Group } from 'three'
import type { Vec3 } from '../../core/math/vec3'
import type { Port } from '../../core/snake/arm'
import { useStore } from '../../state/store'
import { cssVar } from './cssVar'

const Z = new Vector3(0, 0, 1)
const round = (v: number) => Math.round(v * 1000) / 1000
const ARROW_MM = 250
const HEAD_MM = 60

// A disc of the port's diameter lying across the opening and an arrow along the insertion direction.
function PortMarker({ port, selected, color }: { port: Port; selected: boolean; color: string }) {
  const q = useMemo(() => new Quaternion().setFromUnitVectors(Z, new Vector3(...port.direction).normalize()), [port.direction])
  const select = useStore((s) => s.selectPort)
  return (
    <group quaternion={q}>
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          select(port.id)
        }}
      >
        <circleGeometry args={[port.diameterMm / 2, 48]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.45 : 0.25} side={DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, (ARROW_MM - HEAD_MM) / 2]}>
        <cylinderGeometry args={[4, 4, ARROW_MM - HEAD_MM, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, ARROW_MM - HEAD_MM / 2]}>
        <coneGeometry args={[14, HEAD_MM, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

// The selected port can be dragged; the position is stored when the drag ends, so a drag is one undo step.
function Draggable({ port, color }: { port: Port; color: string }) {
  const group = useRef<Group>(null)
  const movePort = useStore((s) => s.movePort)
  useEffect(() => {
    group.current?.position.set(...port.position)
  }, [port.position])
  return (
    <>
      <group ref={group} position={port.position}>
        <PortMarker port={port} selected color={color} />
      </group>
      <TransformControls
        object={group as RefObject<Group>}
        mode="translate"
        size={0.8}
        onMouseUp={() => {
          const p = group.current?.position
          if (!p) return
          // A release without a drag leaves float noise in the position; to the micrometre it is the stored value.
          const next: Vec3 = [round(p.x), round(p.y), round(p.z)]
          if (next.some((v, i) => Math.abs(v - port.position[i]!) > 1e-6)) movePort(port.id, next)
        }}
      />
    </>
  )
}

export function PortMarkers() {
  const ports = useStore((s) => s.ports)
  const selectedId = useStore((s) => s.selectedPortId)
  const active = useStore((s) => s.activeStep === 'access')
  const colors = useMemo(() => ({ selected: cssVar('--brand-secondary'), other: cssVar('--scene-select') }), [])
  if (ports.length === 0) return null
  return (
    <>
      {ports.map((port) =>
        active && port.id === selectedId ? (
          <Draggable key={port.id} port={port} color={colors.selected} />
        ) : (
          <group key={port.id} position={port.position}>
            <PortMarker port={port} selected={false} color={colors.other} />
          </group>
        ),
      )}
    </>
  )
}
