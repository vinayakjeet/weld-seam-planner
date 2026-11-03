import { describe, expect, it } from 'vitest'
import { reconcileOrder } from '../../../src/core/sequence/order'

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
