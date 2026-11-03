import { CameraControls, GizmoHelper, GizmoViewcube, Grid } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import { Sphere, Vector3, type Mesh } from 'three'
import { useStore } from '../../state/store'
import { useShortcuts } from '../shell/useShortcuts'
import { AccessCone } from './AccessCone'
import { AirMoves } from './AirMoves'
import { cssVar } from './cssVar'
import { DrawTool } from './DrawTool'
import { GIZMO_MARGIN } from './gizmo'
import { PartMesh } from './PartMesh'
import { PlaybackTorch } from './PlaybackTorch'
import { PortMarkers } from './PortMarkers'
import { PortPlacer } from './PortPlacer'
import { SeamLines } from './SeamLines'
import { SequenceLabels } from './SequenceLabels'
import { SplitTool } from './SplitTool'
import { TorchPreview } from './TorchPreview'
import { WeldGlow } from './WeldGlow'

// Face order is +X, -X, +Y, -Y, +Z, -Z; the camera looks along +Y from the front.
const Z_UP_FACES = ['Right', 'Left', 'Back', 'Front', 'Top', 'Bottom']

// Space left around the fitted part, as a share of its size.
const FIT_PADDING = 0.08

export function Scene() {
  const controls = useRef<CameraControls>(null)
  const partMesh = useRef<Mesh>(null)
  const part = useStore((s) => s.part)
  const invalidate = useThree((state) => state.invalidate)

  const fit = useCallback(() => {
    const current = useStore.getState().part
    if (!controls.current || !current) return
    const min = new Vector3(...current.bbox.min)
    const max = new Vector3(...current.bbox.max)
    // fitToBox would snap the view to the nearest axis; fitting a sphere keeps the angle the user orbited to.
    const sphere = new Sphere(min.clone().add(max).multiplyScalar(0.5), (min.distanceTo(max) / 2) * (1 + FIT_PADDING))
    void controls.current.fitToSphere(sphere, true)
  }, [])

  useEffect(() => {
    if (part) fit()
  }, [part, fit])
  useShortcuts(fit)

  // The loop only runs on demand, so anything that changes the picture outside React has to ask for a frame.
  useEffect(() => useStore.subscribe(() => invalidate()), [invalidate])

  return (
    <>
      <color attach="background" args={[cssVar('--viewport-bg')]} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[300, -400, 600]} intensity={3} />
      <directionalLight position={[-400, 300, 200]} intensity={1} />
      <CameraControls ref={controls} makeDefault />
      <Grid
        rotation={[Math.PI / 2, 0, 0]}
        cellSize={10}
        sectionSize={100}
        cellThickness={0.6}
        sectionThickness={1}
        cellColor={cssVar('--line')}
        sectionColor={cssVar('--part-edge')}
        fadeDistance={2500}
        fadeStrength={1.5}
        infiniteGrid
      />
      <PartMesh ref={partMesh} />
      <SeamLines partRef={partMesh} />
      <DrawTool partRef={partMesh} />
      <SplitTool />
      <PortMarkers />
      <PortPlacer partRef={partMesh} />
      <TorchPreview />
      <AccessCone />
      <AirMoves />
      <WeldGlow />
      <PlaybackTorch />
      <SequenceLabels />
      <GizmoHelper alignment="top-right" margin={[GIZMO_MARGIN, GIZMO_MARGIN]}>
        <GizmoViewcube
          faces={Z_UP_FACES}
          color={cssVar('--bg-2')}
          hoverColor={cssVar('--brand-primary')}
          textColor={cssVar('--text-0')}
          strokeColor={cssVar('--line')}
          opacity={1}
        />
      </GizmoHelper>
    </>
  )
}
