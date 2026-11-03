import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, type RefObject } from 'react'
import { Color, Raycaster, Vector2, Vector3, type Mesh } from 'three'
import { toolEvent } from '../../state/flows'
import { accessFor } from '../../state/accessSlice'
import { reachFor } from '../../state/reachSlice'
import { MERGE_TOLERANCE_MM } from '../../state/seamsSlice'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { getGeometryClient } from '../../worker/client'
import { missedMergeTarget, notATarget } from '../panels/manualText'
import { mergeTargets } from '../tools/mergeTargets'
import { cssVar } from './cssVar'
import { overGizmo } from './gizmo'
import { lineSet, useDisposed } from './lineSet'
import { chooseSeamHit, type SeamLineHit } from './pickSeam'
import { buildSeamSegments, seamSegmentPositions, type Rgb, type SeamPalette } from './seamSegments'

const BASE_WIDTH_PX = 3
const DIM_OPACITY = 0.3
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
  return {
    candidate: rgb('--seam-candidate'),
    accepted: rgb('--seam-accepted'),
    rejected: rgb('--err'),
    access: { standard: rgb('--access-standard'), slim: rgb('--access-slim'), snake: rgb('--access-snake'), blocked: rgb('--access-blocked') },
    reach: { ok: rgb('--reach-ok'), miss: rgb('--reach-miss') },
  }
}

// One merged line set holds every seam. Hover and selection are drawn again, thicker, in small overlay sets because
// line width belongs to the material and cannot differ per seam inside the merged one.
export function SeamLines({ partRef }: { partRef: RefObject<Mesh | null> }) {
  const seams = useVisibleSeams()
  const statusById = useStore((s) => s.statusById)
  const colourBy = useStore((s) => s.colourBy)
  const accessById = useStore((s) => s.accessById)
  const accessPointsById = useStore((s) => s.accessPointsById)
  const accessStep = useStore((s) => s.activeStep === 'access')
  const reachById = useStore((s) => s.reachById)
  const reachPointsById = useStore((s) => s.reachPointsById)
  const reachKeyById = useStore((s) => s.reachKeyById)
  const ports = useStore((s) => s.ports)
  const arm = useStore((s) => s.arm)
  const hoverId = useStore((s) => s.hoverId)
  const selectedId = useStore((s) => s.selectedId)
  const mergeFrom = useStore((s) => (s.tool.tool === 'merge' ? s.tool.from : null))
  const { gl, camera } = useThree()
  // Once the playback has started the seams not yet welded are dimmed, so the welded ones stand out.
  const xray = useStore((s) => s.xray)
  // With x-ray on the seams are drawn over the part, so every layer sits one step higher than the see-through part.
  const lift = xray ? 1 : 0
  const dim = useStore((s) => (s.activeStep === 'sequence' || s.activeStep === 'export') && s.timeS > 0)
  const palette = useMemo(() => readPalette(), [])

  const built = useMemo(
    () =>
      buildSeamSegments(
        seams,
        statusById,
        palette,
        colourBy === 'access' ? (seam) => accessFor({ accessById, accessPointsById }, seam)?.class ?? null : undefined,
        // Only while the Access step is open, and only for a seam whose reach is current.
        accessStep ? (seam) => reachFor({ reachById, reachPointsById, reachKeyById, ports, arm }, seam)?.unreachable ?? null : undefined,
      ),
    [seams, statusById, palette, colourBy, accessById, accessPointsById, accessStep, reachById, reachPointsById, reachKeyById, ports, arm],
  )
  const base = useMemo(
    () => (built.segmentSeam.length > 0 ? lineSet(built.positions, { width: BASE_WIDTH_PX, colors: built.colors, opacity: dim ? DIM_OPACITY : 1, overlay: xray, renderOrder: xray ? 1 : 0 }) : null),
    [built, dim, xray],
  )
  const selected = useMemo(() => {
    const seam = selectedId === null ? undefined : seams.find((s) => s.id === selectedId)
    return seam ? lineSet(seamSegmentPositions(seam), { width: HIGHLIGHT_WIDTH_PX, color: cssVar('--brand-primary'), renderOrder: 1 + lift, overlay: xray }) : null
  }, [seams, selectedId, xray, lift])
  const hovered = useMemo(() => {
    const seam = hoverId === null ? undefined : seams.find((s) => s.id === hoverId)
    return seam ? lineSet(seamSegmentPositions(seam), { width: HIGHLIGHT_WIDTH_PX, color: cssVar('--seam-hover'), renderOrder: 2 + lift, overlay: xray }) : null
  }, [seams, hoverId, xray, lift])

  // While merging, the seams the merge would accept are lit so the choice is visible before the click.
  const targets = useMemo(() => {
    const from = mergeFrom === null ? undefined : seams.find((s) => s.id === mergeFrom)
    const ids = new Set(from ? mergeTargets(from, seams, MERGE_TOLERANCE_MM) : [])
    const found = seams.filter((s) => ids.has(s.id)).map(seamSegmentPositions)
    if (found.length === 0) return null
    const all = new Float32Array(found.reduce((n, part) => n + part.length, 0))
    let at = 0
    for (const part of found) {
      all.set(part, at)
      at += part.length
    }
    return lineSet(all, { width: HIGHLIGHT_WIDTH_PX, color: cssVar('--warn'), renderOrder: 1 + lift, overlay: xray })
  }, [seams, mergeFrom, xray, lift])

  useDisposed(base)
  useDisposed(selected)
  useDisposed(hovered)
  useDisposed(targets)

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
      // With x-ray on the part is see-through, so a seam behind it can be picked.
      const part = xray ? null : partRef.current
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
    // Drawing and splitting use the pointer themselves, so seams under it are not lit or picked.
    const pointerBusy = () => {
      const { tool } = useStore.getState()
      return tool.tool === 'draw' || tool.tool === 'split'
    }
    const onMove = (event: PointerEvent) => {
      // While a button is down the user is orbiting or panning; hovering would only cost frames.
      if (event.buttons !== 0) return
      if (pointerBusy()) {
        useStore.getState().hover(null)
        return
      }
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
      const { select, toggleAccepted, tool, setNotice } = useStore.getState()
      if (pointerBusy()) return
      const id = pickAt(event.clientX, event.clientY)
      if (tool.tool === 'merge') {
        const from = seams.find((s) => s.id === tool.from)
        const clicked = seams.find((s) => s.id === id)
        if (!from) return
        if (!clicked) {
          setNotice(missedMergeTarget(from.label))
          return
        }
        if (clicked.id === from.id) return
        if (mergeTargets(from, [clicked], MERGE_TOLERANCE_MM).length === 0) setNotice(notATarget(clicked.label, from.label))
        else void toolEvent({ type: 'click', target: { kind: 'seam', id: clicked.id, s: 0 } }, getGeometryClient())
        return
      }
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
  }, [gl, camera, base, built.segmentSeam, seams, partRef, xray])

  return (
    <>
      {base && <primitive object={base} />}
      {targets && <primitive object={targets} />}
      {selected && <primitive object={selected} />}
      {hovered && <primitive object={hovered} />}
    </>
  )
}
