import { describe, expect, it } from 'vitest'
import { gizmoMargin, GIZMO_MARGIN, GIZMO_RADIUS, overGizmo } from '../../../src/ui/viewport/gizmo'

describe('overGizmo', () => {
  const width = 1000
  const height = 800

  it('is true at the centre of the view cube in the top right corner', () => {
    expect(overGizmo(width - GIZMO_MARGIN, GIZMO_MARGIN, width, height)).toBe(true)
  })

  it('is true just inside its radius and false just outside', () => {
    expect(overGizmo(width - GIZMO_MARGIN - GIZMO_RADIUS + 1, GIZMO_MARGIN, width, height)).toBe(true)
    expect(overGizmo(width - GIZMO_MARGIN - GIZMO_RADIUS - 1, GIZMO_MARGIN, width, height)).toBe(false)
    expect(overGizmo(width - GIZMO_MARGIN, GIZMO_MARGIN + GIZMO_RADIUS + 1, width, height)).toBe(false)
  })

  it('is false in the rest of the viewport', () => {
    expect(overGizmo(10, 10, width, height)).toBe(false)
    expect(overGizmo(500, 400, width, height)).toBe(false)
  })
})

describe('gizmoMargin', () => {
  it.each([[640, 500], [480, 360], [1400, 900], [684, 760]])('keeps the cube inside a %i x %i canvas', (width, height) => {
    const margin = gizmoMargin(width, height)
    const centre = { x: width - margin, y: margin }
    expect(centre.x - GIZMO_RADIUS).toBeGreaterThanOrEqual(0)
    expect(centre.x + GIZMO_RADIUS).toBeLessThanOrEqual(width)
    expect(centre.y - GIZMO_RADIUS).toBeGreaterThanOrEqual(0)
    expect(centre.y + GIZMO_RADIUS).toBeLessThanOrEqual(height)
  })

  it('moves the cube in when the canvas is too small for the usual margin', () => {
    expect(gizmoMargin(1400, 900)).toBe(GIZMO_MARGIN)
    expect(gizmoMargin(120, 400)).toBeLessThan(GIZMO_MARGIN)
  })

  it('never gives less than the cube radius, even on a canvas smaller than the cube', () => {
    expect(gizmoMargin(60, 60)).toBe(GIZMO_RADIUS)
  })
})
