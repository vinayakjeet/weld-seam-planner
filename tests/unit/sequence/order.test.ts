import { describe, expect, it } from 'vitest'
import { reconcileOrder, reorder, resetToTable, toggleLock, type OrderEntry } from '../../../src/core/sequence/order'

const entry = (seamId: string, reversed = false) => ({ seamId, reversed })

describe('reconcileOrder', () => {
  it('drops an id that is no longer accepted and keeps the rest in order', () => {
    expect(reconcileOrder([entry('c'), entry('b', true), entry('a')], ['a', 'b', 'c'].filter((id) => id !== 'a'))).toEqual([entry('c'), entry('b', true)])
  })

  it('appends a new id after the ordered ones, forward, in table order', () => {
    expect(reconcileOrder([entry('b', true), entry('a')], ['a', 'b', 'c', 'd'])).toEqual([entry('b', true), entry('a'), entry('c'), entry('d')])
  })

  it('keeps the flags and the relative order of the seams that stay', () => {
    const kept = reconcileOrder([entry('x'), entry('c', true), entry('b'), entry('a', true)], ['a', 'b', 'c'])
    expect(kept).toEqual([entry('c', true), entry('b'), entry('a', true)])
  })

  it('lists every table id once even when the order repeats one', () => {
    expect(reconcileOrder([entry('a'), entry('a', true)], ['a', 'b'])).toEqual([entry('a'), entry('b')])
  })

  it('gives table order for an empty order and nothing for an empty table', () => {
    expect(reconcileOrder([], ['a', 'b'])).toEqual([entry('a'), entry('b')])
    expect(reconcileOrder([entry('a')], [])).toEqual([])
    expect(reconcileOrder([], [])).toEqual([])
  })
})

const slot = (seamId: string, locked = false, reversed = false): OrderEntry => ({ seamId, reversed, locked })
const ids = (order: OrderEntry[]) => order.map((e) => e.seamId)
const asOrder = (result: ReturnType<typeof reorder>): OrderEntry[] => {
  if (!Array.isArray(result)) throw new Error(`expected an order, got a refusal: ${result.what}`)
  return result
}

describe('reorder', () => {
  it('moves one row to the place of another', () => {
    expect(ids(asOrder(reorder([slot('a'), slot('b'), slot('c')], 0, 2)))).toEqual(['b', 'c', 'a'])
    expect(ids(asOrder(reorder([slot('a'), slot('b'), slot('c')], 2, 0)))).toEqual(['c', 'a', 'b'])
  })

  it('keeps the direction of every row and leaves the order alone for the same place', () => {
    const order = [slot('a', false, true), slot('b'), slot('c', false, true)]
    expect(asOrder(reorder(order, 0, 2)).find((e) => e.seamId === 'a')!.reversed).toBe(true)
    expect(reorder(order, 1, 1)).toEqual(order)
  })

  it('keeps a locked row at its index when a row moves across it', () => {
    const result = asOrder(reorder([slot('a'), slot('b', true), slot('c'), slot('d')], 0, 3))
    expect(ids(result)).toEqual(['c', 'b', 'd', 'a'])
    expect(result[1]!.locked).toBe(true)
  })

  it('refuses a locked row as the source and a locked slot as the target, in plain words', () => {
    const order = [slot('a'), slot('b', true), slot('c')]
    for (const refusal of [reorder(order, 1, 2), reorder(order, 0, 1)]) {
      expect(Array.isArray(refusal)).toBe(false)
      if (Array.isArray(refusal)) continue
      for (const part of [refusal.what, refusal.why, refusal.next]) expect(part.trim().length).toBeGreaterThan(0)
      expect(`${refusal.what}${refusal.why}${refusal.next}`).not.toMatch(new RegExp('[\\u2013\\u2014]'))
    }
  })

  it('refuses a place that is not in the list', () => {
    expect(Array.isArray(reorder([slot('a'), slot('b')], 0, 5))).toBe(false)
    expect(Array.isArray(reorder([slot('a'), slot('b')], -1, 0))).toBe(false)
  })
})

describe('toggleLock', () => {
  it('flips the lock of one seam and nothing else', () => {
    const once = toggleLock([slot('a'), slot('b')], 'b')
    expect(once.map((e) => e.locked)).toEqual([false, true])
    expect(toggleLock(once, 'b').map((e) => e.locked)).toEqual([false, false])
  })

  it('leaves the order alone for an id it does not know', () => {
    const order = [slot('a')]
    expect(toggleLock(order, 'zz')).toEqual(order)
  })
})

describe('resetToTable', () => {
  it('puts every free seam back in table order, forward', () => {
    const reset = resetToTable([slot('c', false, true), slot('b'), slot('a', false, true)], ['a', 'b', 'c'])
    expect(reset).toEqual([slot('a'), slot('b'), slot('c')])
  })

  it('keeps a locked seam in its slot and direction', () => {
    const reset = resetToTable([slot('c'), slot('b', true, true), slot('a')], ['a', 'b', 'c'])
    expect(ids(reset)).toEqual(['a', 'b', 'c'])
    expect(reset[1]).toEqual(slot('b', true, true))
  })
})
