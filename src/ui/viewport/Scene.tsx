import { CameraControls, GizmoHelper, GizmoViewcube, Grid } from '@react-three/drei'
import { cssVar } from './cssVar'

// Face order is +X, -X, +Y, -Y, +Z, -Z; the camera looks along +Y from the front.
const Z_UP_FACES = ['Right', 'Left', 'Back', 'Front', 'Top', 'Bottom']

export function Scene() {
  return (
    <>
      <color attach="background" args={[cssVar('--viewport-bg')]} />
      <CameraControls makeDefault />
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
      <GizmoHelper alignment="top-right" margin={[72, 72]}>
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
