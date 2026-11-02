import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { overGizmo } from './gizmo'

// A press that moves further than this is an orbit or pan, not a click.
const DRAG_PX = 4

export interface PointerHandlers {
  // Positions are in pixels from the top left of the canvas.
  move?: (x: number, y: number, rect: DOMRect) => void
  leave?: () => void
  // detail is the click count of the browser event: 2 for the second click of a double click.
  click?: (x: number, y: number, rect: DOMRect, detail: number) => void
  doubleClick?: (x: number, y: number, rect: DOMRect) => void
}

// Pointer events on the canvas for a tool that is armed. Orbit drags, the view gizmo and moves with a button down are
// filtered out, so a handler only hears about a deliberate hover or click on the scene.
export function useCanvasPointer(active: boolean, handlers: PointerHandlers): void {
  const element = useThree((state) => state.gl.domElement)
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    if (!active) return
    let down: { x: number; y: number } | null = null
    const local = (event: MouseEvent) => {
      const rect = element.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      return { x, y, rect, onGizmo: overGizmo(x, y, rect.width) }
    }
    const onMove = (event: PointerEvent) => {
      if (event.buttons !== 0) return
      const at = local(event)
      if (at.onGizmo) latest.current.leave?.()
      else latest.current.move?.(at.x, at.y, at.rect)
    }
    const onLeave = () => latest.current.leave?.()
    const onDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY }
    }
    const onClick = (event: MouseEvent) => {
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > DRAG_PX) return
      const at = local(event)
      if (!at.onGizmo) latest.current.click?.(at.x, at.y, at.rect, event.detail)
    }
    const onDoubleClick = (event: MouseEvent) => {
      const at = local(event)
      if (!at.onGizmo) latest.current.doubleClick?.(at.x, at.y, at.rect)
    }
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerleave', onLeave)
    element.addEventListener('pointerdown', onDown)
    element.addEventListener('click', onClick)
    element.addEventListener('dblclick', onDoubleClick)
    return () => {
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerleave', onLeave)
      element.removeEventListener('pointerdown', onDown)
      element.removeEventListener('click', onClick)
      element.removeEventListener('dblclick', onDoubleClick)
    }
  }, [active, element])
}
