import { describe, expect, it } from 'vitest'
import { GIZMO_MARGIN, GIZMO_RADIUS, overGizmo } from '../../../src/ui/viewport/gizmo'

describe('overGizmo', () => {
  const width = 1000

  it('is true at the centre of the view cube in the top right corner', () => {
    expect(overGizmo(width - GIZMO_MARGIN, GIZMO_MARGIN, width)).toBe(true)
  })

  it('is true just inside its radius and false just outside', () => {
    expect(overGizmo(width - GIZMO_MARGIN - GIZMO_RADIUS + 1, GIZMO_MARGIN, width)).toBe(true)
    expect(overGizmo(width - GIZMO_MARGIN - GIZMO_RADIUS - 1, GIZMO_MARGIN, width)).toBe(false)
    expect(overGizmo(width - GIZMO_MARGIN, GIZMO_MARGIN + GIZMO_RADIUS + 1, width)).toBe(false)
  })

  it('is false in the rest of the viewport', () => {
    expect(overGizmo(10, 10, width)).toBe(false)
    expect(overGizmo(500, 400, width)).toBe(false)
  })
})
