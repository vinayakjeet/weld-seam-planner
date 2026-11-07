import { useFrame, useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { DoubleSide, Quaternion, Vector3, type Group } from 'three'
import type { Vec3 } from '../../core/math/vec3'
import type { Port } from '../../core/snake/arm'
import { useStore } from '../../state/store'
import { cssVar } from './cssVar'
import { toLocal } from '../../core/mesh/displayOrigin'
import { useOrigin } from './origin'

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

// Written on the viewport for the end to end tests: where the selected port is on the canvas in CSS pixels, and whether its
// handles are shown. A test needs the first to press exactly on the handles.
function PortProbe({ position, moving }: { position: Vec3; moving: boolean }) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const point = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const main = gl.domElement.closest('main')
    if (!main) return
    point.set(...position).project(camera)
    const rect = gl.domElement.getBoundingClientRect()
    main.setAttribute('data-port-screen', `${Math.round(((point.x + 1) / 2) * rect.width)},${Math.round(((1 - point.y) / 2) * rect.height)}`)
    main.setAttribute('data-port-gizmo', moving ? '1' : '0')
  })
  return null
}

// The selected port shows its handles only after Move is pressed on its card, so an orbit that starts on the marker cannot
// drag it. The position is stored when the drag ends, so a drag is one undo step.
function Draggable({ port, color }: { port: Port; color: string }) {
  const group = useRef<Group>(null)
  const movePort = useStore((s) => s.movePort)
  const moving = useStore((s) => s.movingPort)
  const origin = useOrigin()
  const local = useMemo(() => toLocal(port.position, origin), [port.position, origin])
  useEffect(() => {
    group.current?.position.set(...local)
  }, [local])
  return (
    <>
      <group ref={group} position={local}>
        <PortMarker port={port} selected color={color} />
      </group>
      <PortProbe position={local} moving={moving} />
      {moving && (
        <TransformControls
          object={group as RefObject<Group>}
          mode="translate"
          size={0.8}
          onMouseUp={() => {
            const p = group.current?.position
            if (!p) return
            // A release without a drag leaves float noise in the position; to the micrometre it is the stored value.
            const next: Vec3 = [round(p.x + origin[0]), round(p.y + origin[1]), round(p.z + origin[2])]
            if (next.some((v, i) => Math.abs(v - port.position[i]!) > 1e-6)) movePort(port.id, next)
          }}
        />
      )}
    </>
  )
}

export function PortMarkers() {
  const ports = useStore((s) => s.ports)
  const selectedId = useStore((s) => s.selectedPortId)
  const active = useStore((s) => s.activeStep === 'access')
  const moving = useStore((s) => s.movingPort)
  const colors = useMemo(() => ({ selected: cssVar('--brand-secondary'), other: cssVar('--scene-select') }), [])
  const origin = useOrigin()
  useEffect(() => {
    if (!moving) return
    const onKey = (event: KeyboardEvent) => {
      // Escape in a number field belongs to the field (it undoes the edit), not to the move.
      if (event.key === 'Escape' && !(event.target instanceof HTMLInputElement)) useStore.getState().setMovingPort(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moving])
  if (ports.length === 0) return null
  return (
    <>
      {ports.map((port) =>
        active && port.id === selectedId ? (
          <Draggable key={port.id} port={port} color={colors.selected} />
        ) : (
          <group key={port.id} position={toLocal(port.position, origin)}>
            <PortMarker port={port} selected={false} color={colors.other} />
          </group>
        ),
      )}
    </>
  )
}
