import { useGizmoContext } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, Vector3 } from 'three'
import { CUBE_FACES } from './viewCubeFaces'

export interface ViewCubeColours {
  face: string
  hover: string
  text: string
  stroke: string
}

const FONT = '600 20px Onest, system-ui, sans-serif'
const SIZE = 60
const at = (xyz: [number, number, number]) => new Vector3(...xyz).multiplyScalar(0.38)
const CORNERS = ([[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]] as const).map((c) => at([...c]))
const EDGES = ([[1, 1, 0], [1, 0, 1], [1, 0, -1], [1, -1, 0], [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1], [-1, 1, 0], [-1, 0, 1], [-1, 0, -1], [-1, -1, 0]] as const).map((e) =>
  at([...e]),
)
const edgeSize = (edge: Vector3): [number, number, number] => [edge.x === 0 ? 0.5 : 0.25, edge.y === 0 ? 0.5 : 0.25, edge.z === 0 ? 0.5 : 0.25]

// The labels use the UI face; a canvas draws with whatever is loaded, so the textures are drawn again once it is.
function useFontLoaded(font: string): boolean {
  const [loaded, setLoaded] = useState(() => document.fonts.check(font))
  useEffect(() => {
    if (loaded) return
    let live = true
    void document.fonts.load(font).then(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [font, loaded])
  return loaded
}

function FaceMaterial({ index, hover, colours, fontLoaded }: { index: number; hover: boolean; colours: ViewCubeColours; fontLoaded: boolean }) {
  const anisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')!
    context.fillStyle = colours.face
    context.fillRect(0, 0, 128, 128)
    context.strokeStyle = colours.stroke
    context.strokeRect(0, 0, 128, 128)
    context.font = FONT
    context.textAlign = 'center'
    context.fillStyle = colours.text
    context.fillText(CUBE_FACES[index]!.label.toUpperCase(), 64, 71)
    const map = new CanvasTexture(canvas)
    map.anisotropy = anisotropy || 1
    map.center.set(0.5, 0.5)
    map.rotation = CUBE_FACES[index]!.rotation
    return map
    // fontLoaded only asks for the canvas to be drawn again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, colours.face, colours.stroke, colours.text, anisotropy, fontLoaded])
  useEffect(() => () => texture.dispose(), [texture])
  return <meshBasicMaterial attach={`material-${index}`} map={texture} color={hover ? colours.hover : 'white'} />
}

function EdgeCube({ position, size, hoverColour }: { position: Vector3; size: [number, number, number]; hoverColour: string }) {
  const { tweenCamera } = useGizmoContext()
  const [hover, setHover] = useState(false)
  return (
    <mesh
      scale={1.01}
      position={position}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        setHover(true)
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        setHover(false)
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        tweenCamera(position)
      }}
    >
      <meshBasicMaterial color={hoverColour} transparent opacity={0.6} visible={hover} />
      <boxGeometry args={size} />
    </mesh>
  )
}

// The view cube in the top right corner: a click on a face, edge or corner turns the camera to look from there. Its
// labels read upright in the standard views of a z up part (viewCubeFaces).
export function ViewCube({ colours }: { colours: ViewCubeColours }) {
  const { tweenCamera } = useGizmoContext()
  const [hover, setHover] = useState<number | null>(null)
  const fontLoaded = useFontLoaded(FONT)
  return (
    <group scale={[SIZE, SIZE, SIZE]}>
      <mesh
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          setHover(Math.floor((e.faceIndex ?? 0) / 2))
        }}
        onPointerOut={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          setHover(null)
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (e.face) tweenCamera(e.face.normal)
        }}
      >
        {CUBE_FACES.map((face, index) => (
          <FaceMaterial key={face.label} index={index} hover={hover === index} colours={colours} fontLoaded={fontLoaded} />
        ))}
        <boxGeometry />
      </mesh>
      {EDGES.map((edge, i) => (
        <EdgeCube key={`edge-${i}`} position={edge} size={edgeSize(edge)} hoverColour={colours.hover} />
      ))}
      {CORNERS.map((corner, i) => (
        <EdgeCube key={`corner-${i}`} position={corner} size={[0.25, 0.25, 0.25]} hoverColour={colours.hover} />
      ))}
    </group>
  )
}
