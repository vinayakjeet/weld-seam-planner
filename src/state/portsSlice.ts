import type { StateCreator } from 'zustand'
import type { Vec3 } from '../core/math/vec3'
import { clampArm, DEFAULT_ARM, type ArmParams, type Port } from '../core/snake/arm'
import { portNumber } from '../ui/panels/portRows'
import type { AppState } from './store'

export const PORT_DIAMETER_MM = { min: 50, max: 2000, default: 600 } as const

// The ports and the arm are part of the plan (history and the saved plan); which port is selected and whether a click
// on the part places one are not.
export interface PortsSlice {
  ports: Port[]
  arm: ArmParams
  selectedPortId: string | null
  placingPort: boolean
  // The next port number, kept apart from the list so a deleted port's id is not given out again.
  nextPortNumber: number
  addPort: (position: Vec3, direction: Vec3) => string
  movePort: (id: string, position: Vec3) => void
  setPortDiameter: (id: string, mm: number) => void
  deletePort: (id: string) => void
  setArm: (patch: Partial<ArmParams>) => void
  setPlacingPort: (on: boolean) => void
  selectPort: (id: string | null) => void
}

// The highest number in a list of ports plus one: the floor for the counter after a plan is restored.
export const nextNumberAfter = (ports: Port[]): number => Math.max(0, ...ports.map((p) => portNumber(p.id))) + 1

export const createPortsSlice: StateCreator<AppState, [], [], PortsSlice> = (set, get) => ({
  ports: [],
  arm: DEFAULT_ARM,
  selectedPortId: null,
  placingPort: false,
  nextPortNumber: 1,

  addPort: (position, direction) => {
    const state = get()
    const n = Math.max(state.nextPortNumber, nextNumberAfter(state.ports))
    const id = `P${n}`
    set({
      ports: [...state.ports, { id, position, direction, diameterMm: PORT_DIAMETER_MM.default }],
      nextPortNumber: n + 1,
      selectedPortId: id,
      placingPort: false,
    })
    return id
  },

  movePort: (id, position) =>
    set((state) => (state.ports.some((p) => p.id === id) ? { ports: state.ports.map((p) => (p.id === id ? { ...p, position } : p)) } : state)),

  setPortDiameter: (id, mm) =>
    set((state) => {
      const diameterMm = Math.min(PORT_DIAMETER_MM.max, Math.max(PORT_DIAMETER_MM.min, mm))
      const port = state.ports.find((p) => p.id === id)
      if (!port || port.diameterMm === diameterMm) return state
      return { ports: state.ports.map((p) => (p.id === id ? { ...p, diameterMm } : p)) }
    }),

  deletePort: (id) =>
    set((state) =>
      state.ports.some((p) => p.id === id)
        ? { ports: state.ports.filter((p) => p.id !== id), selectedPortId: state.selectedPortId === id ? null : state.selectedPortId }
        : state,
    ),

  setArm: (patch) =>
    set((state) => {
      const arm = clampArm({ ...state.arm, ...patch })
      return (Object.keys(arm) as Array<keyof ArmParams>).every((key) => arm[key] === state.arm[key]) ? state : { arm }
    }),

  setPlacingPort: (placingPort) => set((state) => (state.placingPort === placingPort ? state : { placingPort })),

  selectPort: (selectedPortId) => set((state) => (state.selectedPortId === selectedPortId ? state : { selectedPortId })),
})
