import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ARM } from '../../../src/core/snake/arm'
import { selectPlan } from '../../../src/state/selectors'
import { useStore } from '../../../src/state/store'
import { resetStore } from '../helpers/state'

const state = () => useStore.getState()
const temporal = () => useStore.temporal.getState()
const DOWN: [number, number, number] = [0, 0, -1]

beforeEach(resetStore)

describe('ports slice', () => {
  it('starts with no port, the default arm, nothing selected and not placing', () => {
    expect(state().ports).toEqual([])
    expect(state().arm).toEqual(DEFAULT_ARM)
    expect(state().selectedPortId).toBeNull()
    expect(state().placingPort).toBe(false)
  })

  it('names ports P1 and P2, and never reuses an id after a delete', () => {
    expect(state().addPort([0, 0, 0], DOWN)).toBe('P1')
    expect(state().addPort([10, 0, 0], DOWN)).toBe('P2')
    state().deletePort('P2')
    expect(state().addPort([20, 0, 0], DOWN)).toBe('P3')
    expect(state().ports.map((p) => p.id)).toEqual(['P1', 'P3'])
  })

  it('adds a port of 600 mm, selects it and stops placing', () => {
    state().setPlacingPort(true)
    const id = state().addPort([1, 2, 3], DOWN)
    expect(state().ports[0]).toEqual({ id, position: [1, 2, 3], direction: DOWN, diameterMm: 600 })
    expect(state().selectedPortId).toBe(id)
    expect(state().placingPort).toBe(false)
  })

  it('makes each of add, move, diameter and delete one undo step', () => {
    state().addPort([0, 0, 0], DOWN)
    expect(temporal().pastStates).toHaveLength(1)
    state().movePort('P1', [5, 6, 7])
    expect(temporal().pastStates).toHaveLength(2)
    state().setPortDiameter('P1', 400)
    expect(temporal().pastStates).toHaveLength(3)
    state().deletePort('P1')
    expect(temporal().pastStates).toHaveLength(4)
    temporal().undo()
    expect(state().ports[0]).toMatchObject({ position: [5, 6, 7], diameterMm: 400 })
    temporal().undo()
    expect(state().ports[0]).toMatchObject({ position: [5, 6, 7], diameterMm: 600 })
    temporal().undo()
    expect(state().ports[0]!.position).toEqual([0, 0, 0])
    temporal().undo()
    expect(state().ports).toEqual([])
    temporal().redo()
    expect(state().ports).toHaveLength(1)
  })

  it('clamps the diameter to 50 to 2000 mm', () => {
    state().addPort([0, 0, 0], DOWN)
    state().setPortDiameter('P1', 10)
    expect(state().ports[0]!.diameterMm).toBe(50)
    state().setPortDiameter('P1', 9000)
    expect(state().ports[0]!.diameterMm).toBe(2000)
  })

  it('ignores a move or diameter for a port that does not exist, adding no undo step', () => {
    state().movePort('P9', [1, 1, 1])
    state().setPortDiameter('P9', 100)
    state().deletePort('P9')
    expect(temporal().pastStates).toHaveLength(0)
  })

  it('clears the selection when the selected port is deleted', () => {
    const id = state().addPort([0, 0, 0], DOWN)
    state().deletePort(id)
    expect(state().selectedPortId).toBeNull()
  })

  it('clamps the arm through clampArm and keeps the fields it was not given', () => {
    state().setArm({ maxBendDeg: 90 })
    expect(state().arm.maxBendDeg).toBe(45)
    expect(state().arm.links).toBe(DEFAULT_ARM.links)
    state().setArm({ maxBendDeg: 25 })
    expect(state().arm.maxBendDeg).toBe(25)
  })

  it('does not add an undo step when the arm does not change', () => {
    state().setArm({ maxBendDeg: DEFAULT_ARM.maxBendDeg })
    expect(temporal().pastStates).toHaveLength(0)
    state().setArm({ maxBendDeg: 25 })
    expect(temporal().pastStates).toHaveLength(1)
    temporal().undo()
    expect(state().arm.maxBendDeg).toBe(DEFAULT_ARM.maxBendDeg)
  })

  it('puts the ports and the arm into the plan', () => {
    state().addPort([0, 0, 0], DOWN)
    state().setArm({ links: 12 })
    expect(selectPlan(state()).access).toEqual({ ports: state().ports, arm: state().arm })
    expect(selectPlan(state()).access.arm.links).toBe(12)
  })

  it('keeps selecting a port out of the undo history', () => {
    state().addPort([0, 0, 0], DOWN)
    const before = temporal().pastStates.length
    state().selectPort('P1')
    state().selectPort(null)
    state().setPlacingPort(true)
    expect(temporal().pastStates).toHaveLength(before)
  })
})
