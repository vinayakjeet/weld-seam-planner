import { describe, expect, it } from 'vitest'
import { installDropGuard } from '../../../src/ui/shell/dropGuard'

function dragEvent(type: 'dragover' | 'drop', types: string[], files: unknown[] = []) {
  const dataTransfer = { types, files, dropEffect: 'none' }
  return Object.assign(new Event(type, { cancelable: true }), { dataTransfer })
}

function setup() {
  const target = new EventTarget()
  const received: unknown[][] = []
  const dispose = installDropGuard(target, (files) => received.push(files))
  return { target, received, dispose }
}

describe('installDropGuard', () => {
  it('accepts a file drag so the browser does not treat the page as a link target', () => {
    const { target } = setup()
    const event = dragEvent('dragover', ['Files'])
    target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(event.dataTransfer.dropEffect).toBe('copy')
  })

  it('leaves other drags alone, such as selected text', () => {
    const { target, received } = setup()
    const over = dragEvent('dragover', ['text/plain'])
    const drop = dragEvent('drop', ['text/plain'])
    target.dispatchEvent(over)
    target.dispatchEvent(drop)
    expect(over.defaultPrevented).toBe(false)
    expect(drop.defaultPrevented).toBe(false)
    expect(received).toEqual([])
  })

  it('cancels a dropped file so the browser never navigates to it, and hands the files on', () => {
    const { target, received } = setup()
    const file = { name: 'a.stl' }
    const event = dragEvent('drop', ['Files'], [file])
    target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(received).toEqual([[file]])
  })

  it('does not hand on a drop that something nearer already handled', () => {
    const { target, received } = setup()
    const event = dragEvent('drop', ['Files'], [{ name: 'a.stl' }])
    const nearer = new EventTarget()
    nearer.addEventListener('drop', (e) => e.preventDefault())
    nearer.dispatchEvent(event)
    target.dispatchEvent(event)
    expect(received).toEqual([])
  })

  it('stops listening once disposed', () => {
    const { target, received, dispose } = setup()
    dispose()
    const event = dragEvent('drop', ['Files'], [{ name: 'a.stl' }])
    target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(received).toEqual([])
  })
})
