import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, type RefObject } from 'react'
import { Color, Raycaster, Vector2, Vector3, type Mesh } from 'three'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { cssVar } from './cssVar'
import { overGizmo } from './gizmo'
import { chooseSeamHit, type SeamLineHit } from './pickSeam'
import { buildSeamSegments, seamSegmentPositions, type Rgb, type SeamPalette } from './seamSegments'

const BASE_WIDTH_PX = 3
const HIGHLIGHT_WIDTH_PX = 5
// How far from a seam, in screen pixels, the cursor still counts as on it.
const PICK_RADIUS_PX = 6
// A press that moves further than this is an orbit or pan, not a click.
const DRAG_PX = 4
// Occlusion needs one part ray per candidate, so only the nearest few are checked.
const MAX_CANDIDATES = 24

function rgb(name: string): Rgb {
  const color = new Color(cssVar(name))
  return [color.r, color.g, color.b]
}

function readPalette(): SeamPalette {
  return { candidate: rgb('--seam-candidate'), accepted: rgb('--seam-accepted'), rejected: rgb('--err') }
}

interface LineStyle {
  width: number
  colors?: Float32Array
  color?: string
  renderOrder?: number
}

function lineSet(positions: Float32Array, { width, colors, color, renderOrder = 0 }: LineStyle): LineSegments2 {
  const geometry = new LineSegmentsGeometry()
  geometry.setPositions(positions)
  if (colors) geometry.setColors(colors)
  const material = new LineMaterial({ linewidth: width, vertexColors: colors !== undefined })
  if (color) material.color = new Color(color)
  const lines = new LineSegments2(geometry, material)
  lines.frustumCulled = false
  lines.renderOrder = renderOrder
  return lines
}

function useDisposed(lines: LineSegments2 | null): void {
  useEffect(
    () => () => {
      if (!lines) return
      lines.geometry.dispose()
      lines.material.dispose()
    },
    [lines],
  )
}

// One merged line set holds every seam. Hover and selection are drawn again, thicker, in small overlay sets because
// line width belongs to the material and cannot differ per seam inside the merged one.
export function SeamLines({ partRef }: { partRef: RefObject<Mesh | null> }) {
  const seams = useVisibleSeams()
  const statusById = useStore((s) => s.statusById)
  const hoverId = useStore((s) => s.hoverId)
  const selectedId = useStore((s) => s.selectedId)
  const { gl, camera } = useThree()
  const palette = useMemo(() => readPalette(), [])

  const built = useMemo(() => buildSeamSegments(seams, statusById, palette), [seams, statusById, palette])
  const base = useMemo(
    () => (built.segmentSeam.length > 0 ? lineSet(built.positions, { width: BASE_WIDTH_PX, colors: built.colors }) : null),
    [built],
  )
  const selected = useMemo(() => {
    const seam = selectedId === null ? undefined : seams.find((s) => s.id === selectedId)
    return seam ? lineSet(seamSegmentPositions(seam), { width: HIGHLIGHT_WIDTH_PX, color: cssVar('--brand-primary'), renderOrder: 1 }) : null
  }, [seams, selectedId])
  const hovered = useMemo(() => {
    const seam = hoverId === null ? undefined : seams.find((s) => s.id === hoverId)
    return seam ? lineSet(seamSegmentPositions(seam), { width: HIGHLIGHT_WIDTH_PX, color: cssVar('--seam-hover'), renderOrder: 2 }) : null
  }, [seams, hoverId])

  useDisposed(base)
  useDisposed(selected)
  useDisposed(hovered)

  useEffect(() => {
    if (!base) return
    const element = gl.domElement
    const raycaster = new Raycaster()
    raycaster.params.Line2 = { threshold: PICK_RADIUS_PX }
    const toPart = new Raycaster()
    toPart.firstHitOnly = true
    const pointer = new Vector2()
    const eye = new Vector3()
    const toward = new Vector3()

    // Returns the id of the nearest seam under the cursor that the part is not covering.
    const pickAt = (clientX: number, clientY: number): string | null => {
      const rect = element.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      if (overGizmo(x, y, rect.width)) return null
      pointer.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const raw = raycaster.intersectObject(base, false).slice(0, MAX_CANDIDATES)
      if (raw.length === 0) return null

      camera.getWorldPosition(eye)
      const part = partRef.current
      const hits: SeamLineHit[] = []
      for (const hit of raw) {
        const point = (hit as { pointOnLine?: Vector3 }).pointOnLine
        if (hit.faceIndex == null || !point) continue
        const distance = eye.distanceTo(point)
        let occluderDistance: number | null = null
        if (part) {
          toPart.set(eye, toward.copy(point).sub(eye).normalize())
          occluderDistance = toPart.intersectObject(part, false)[0]?.distance ?? null
        }
        hits.push({ segment: hit.faceIndex, distance, occluderDistance })
      }
      const nearest = hits.reduce((least, hit) => Math.min(least, hit.distance), Infinity)
      const index = chooseSeamHit(hits, built.segmentSeam, Math.max(0.05, 0.002 * nearest))
      return index === null ? null : (seams[index]?.id ?? null)
    }

    let frame = 0
    let last: { x: number; y: number } | null = null
    const hoverNow = () => {
      frame = 0
      if (!last) return
      useStore.getState().hover(pickAt(last.x, last.y))
    }
    const onMove = (event: PointerEvent) => {
      // While a button is down the user is orbiting or panning; hovering would only cost frames.
      if (event.buttons !== 0) return
      last = { x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(hoverNow)
    }
    // Moves made with a button down were skipped, so look again where the drag ended.
    const onUp = (event: PointerEvent) => {
      last = { x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(hoverNow)
    }
    const onLeave = () => {
      last = null
      useStore.getState().hover(null)
    }
    let down: { x: number; y: number } | null = null
    const onDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY }
    }
    const onClick = (event: MouseEvent) => {
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > DRAG_PX) return
      const { select, toggleAccepted } = useStore.getState()
      const id = pickAt(event.clientX, event.clientY)
      select(id)
      if (id !== null) toggleAccepted(id)
    }

    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', onUp)
    element.addEventListener('pointerleave', onLeave)
    element.addEventListener('pointerdown', onDown)
    element.addEventListener('click', onClick)
    return () => {
      cancelAnimationFrame(frame)
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', onUp)
      element.removeEventListener('pointerleave', onLeave)
      element.removeEventListener('pointerdown', onDown)
      element.removeEventListener('click', onClick)
    }
  }, [gl, camera, base, built.segmentSeam, seams, partRef])

  return (
    <>
      {base && <primitive object={base} />}
      {selected && <primitive object={selected} />}
      {hovered && <primitive object={hovered} />}
    </>
  )
}
