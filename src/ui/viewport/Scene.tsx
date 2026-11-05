import { CameraControls, GizmoHelper, GizmoViewcube, Grid } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useCallback, useMemo, useEffect, useRef } from 'react'
import { Sphere, Vector3, type Mesh } from 'three'
import { useStore } from '../../state/store'
import { useShortcuts } from '../shell/useShortcuts'
import { AccessCone } from './AccessCone'
import { AirMoves } from './AirMoves'
import { ArmCapsules } from './ArmCapsules'
import { cssVar } from './cssVar'
import { DrawTool } from './DrawTool'
import { gizmoMargin } from './gizmo'
import { LIGHT_RIG } from './lighting'
import { PartEdges } from './PartEdges'
import { PartMesh } from './PartMesh'
import { PlaybackTorch } from './PlaybackTorch'
import { PortMarkers } from './PortMarkers'
import { PortPlacer } from './PortPlacer'
import { viewEye, type Vec3 } from './standardViews'
import { SeamLines } from './SeamLines'
import { SequenceLabels } from './SequenceLabels'
import { SplitTool } from './SplitTool'
import { TorchPreview } from './TorchPreview'
import { WeldGlow } from './WeldGlow'
import { displayOrigin } from '../../core/mesh/displayOrigin'
import { OriginContext } from './origin'

// Face order is +X, -X, +Y, -Y, +Z, -Z; the camera looks along +Y from the front.
const Z_UP_FACES = ['Right', 'Left', 'Back', 'Front', 'Top', 'Bottom']

// Space left around the fitted part, as a share of its size.
const FIT_PADDING = 0.08

export function Scene() {
  const controls = useRef<CameraControls>(null)
  const partMesh = useRef<Mesh>(null)
  const part = useStore((s) => s.part)
  const origin = useMemo(() => displayOrigin(part?.bbox ?? null), [part])
  // Read so that the scene draws again, and reads the colour tokens again, when the theme changes.
  useStore((s) => s.theme)
  const invalidate = useThree((state) => state.invalidate)
  const size = useThree((state) => state.size)
  const margin = gizmoMargin(size.width, size.height)

  const fit = useCallback(() => {
    const current = useStore.getState().part
    if (!controls.current || !current) return
    const min = new Vector3(...current.bbox.min)
    const max = new Vector3(...current.bbox.max)
    // fitToBox would snap the view to the nearest axis; fitting a sphere keeps the angle the user orbited to.
    const sphere = new Sphere(min.clone().add(max).multiplyScalar(0.5), (min.distanceTo(max) / 2) * (1 + FIT_PADDING))
    void controls.current.fitToSphere(sphere, true)
  }, [])

  // Turns the camera to a standard view of the part, then fits it; the fit keeps the angle that was just set.
  const showView = useCallback(
    (index: number) => {
      const current = useStore.getState().part
      if (!controls.current || !current) return
      const min = new Vector3(...current.bbox.min)
      const max = new Vector3(...current.bbox.max)
      const centre = min.clone().add(max).multiplyScalar(0.5)
      const target: Vec3 = [centre.x, centre.y, centre.z]
      const eye = viewEye(target, min.distanceTo(max) * 2, index)
      void controls.current.setLookAt(eye[0], eye[1], eye[2], target[0], target[1], target[2], false)
      fit()
    },
    [fit],
  )

  useEffect(() => {
    if (part) fit()
  }, [part, fit])
  useShortcuts(fit, showView)

  // The loop only runs on demand, so anything that changes the picture outside React has to ask for a frame.
  useEffect(() => useStore.subscribe(() => invalidate()), [invalidate])

  return (
    <>
      <color attach="background" args={[cssVar('--viewport-bg')]} />
      <ambientLight intensity={LIGHT_RIG.ambient} />
      <directionalLight position={LIGHT_RIG.key.position} intensity={LIGHT_RIG.key.intensity} />
      <directionalLight position={LIGHT_RIG.fill.position} intensity={LIGHT_RIG.fill.intensity} />
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
      {/* Everything drawn from the part's coordinates sits in this group at the display origin, relative to it. */}
      <OriginContext.Provider value={origin}>
        <group position={origin}>
            <PartMesh ref={partMesh} />
            <PartEdges />
            <SeamLines partRef={partMesh} />
            <DrawTool partRef={partMesh} />
            <SplitTool partRef={partMesh} />
            <PortMarkers />
            <ArmCapsules />
            <PortPlacer partRef={partMesh} />
            <TorchPreview />
            <AccessCone />
            <AirMoves />
            <WeldGlow />
            <PlaybackTorch />
            <SequenceLabels />
        </group>
      </OriginContext.Provider>
      <GizmoHelper alignment="top-right" margin={[margin, margin]}>
        <GizmoViewcube
          faces={Z_UP_FACES}
          color={cssVar('--bg-2')}
          hoverColor={cssVar('--scene-select')}
          textColor={cssVar('--text-0')}
          strokeColor={cssVar('--line')}
          opacity={1}
        />
      </GizmoHelper>
    </>
  )
}
