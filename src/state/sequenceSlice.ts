import type { StateCreator } from 'zustand'
import type { Explained } from '../core/job/plan'
import { reorder, resetToTable, toggleLock, type OrderEntry } from '../core/sequence/order'
import type { SequenceStrategy } from '../core/sequence/types'
import { selectSequenceOrder, selectTableIds } from './selectors'
import type { AppState } from './store'

// The strategy the stored order came from, and the order itself. Both are undo history. An empty order means the
// sequence was never touched: the plan then runs in table order and has no sequence of its own.
export interface SequenceSlice {
  strategy: SequenceStrategy
  order: OrderEntry[]
  // Stores an order from the optimiser, keeping the locks of the seams that were locked.
  setSequence: (strategy: SequenceStrategy, order: { seamId: string; reversed: boolean }[]) => void
  // Moves the row at from to the place of the row at to and sets the strategy to manual. Returns why it was refused, or null.
  reorder: (from: number, to: number) => Explained | null
  toggleLock: (seamId: string) => void
  // Back to table order, keeping locked seams where they are.
  useTableOrder: () => void
}

export const createSequenceSlice: StateCreator<AppState, [], [], SequenceSlice> = (set, get) => ({
  strategy: 'table-order',
  order: [],

  setSequence: (strategy, order) => {
    const locked = new Set(selectSequenceOrder(get()).filter((e) => e.locked).map((e) => e.seamId))
    set({ strategy, order: order.map((e) => ({ seamId: e.seamId, reversed: e.reversed, locked: locked.has(e.seamId) })) })
  },

  reorder: (from, to) => {
    const result = reorder(selectSequenceOrder(get()), from, to)
    if (!Array.isArray(result)) return result
    set({ order: result, strategy: 'manual' })
    return null
  },

  toggleLock: (seamId) => set({ order: toggleLock(selectSequenceOrder(get()), seamId) }),

  useTableOrder: () => set({ order: resetToTable(selectSequenceOrder(get()), selectTableIds(get())), strategy: 'table-order' }),
})
