import { describe, expect, it, vi } from 'vitest'
import { geometryWorkerName, glTakesSharedBuffers, SHARED_WORKER_NAME } from '../../../src/worker/sharedMemory'

// The few calls the probe makes, with the answers a browser could give.
function fakeGl(options: { throws?: boolean; error?: number } = {}) {
  const gl = {
    ARRAY_BUFFER: 1,
    ELEMENT_ARRAY_BUFFER: 2,
    STATIC_DRAW: 3,
    NO_ERROR: 0,
    createBuffer: vi.fn(() => ({ id: Math.random() })),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(() => {
      if (options.throws) throw new TypeError('The provided ArrayBufferView value must not be shared.')
    }),
    getError: vi.fn(() => options.error ?? 0),
    deleteBuffer: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
  }
  return gl as unknown as WebGLRenderingContext
}

describe('glTakesSharedBuffers', () => {
  it('is true when WebGL takes shared vertex and index data without an error', () => {
    const gl = fakeGl()
    expect(glTakesSharedBuffers(() => gl)).toBe(true)
    const calls = (gl.bufferData as unknown as ReturnType<typeof vi.fn>).mock.calls as unknown[][]
    expect(calls.map((c) => (c[1] as ArrayBufferView).buffer instanceof SharedArrayBuffer)).toEqual([true, true])
    expect(calls.map((c) => c[0])).toEqual([1, 2])
    // WebGL refuses one buffer bound to both targets, so the probe uses two.
    expect(new Set((gl.bindBuffer as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[1])).size).toBe(2)
  })

  it('is false when the browser throws on a shared view, as Safari has', () => {
    expect(glTakesSharedBuffers(() => fakeGl({ throws: true }))).toBe(false)
  })

  it('is false when WebGL reports an error for the upload', () => {
    expect(glTakesSharedBuffers(() => fakeGl({ error: 0x0501 }))).toBe(false)
  })

  it('is false when there is no WebGL context or making one throws', () => {
    expect(glTakesSharedBuffers(() => null)).toBe(false)
    expect(
      glTakesSharedBuffers(() => {
        throw new Error('no canvas')
      }),
    ).toBe(false)
  })
})

describe('geometryWorkerName', () => {
  it('asks for the shared worker only when the page is isolated and WebGL takes the data', () => {
    expect(geometryWorkerName({ isolated: true, takes: () => true })).toBe(SHARED_WORKER_NAME)
    expect(geometryWorkerName({ isolated: true, takes: () => false })).not.toBe(SHARED_WORKER_NAME)
    expect(geometryWorkerName({ isolated: false, takes: () => true })).not.toBe(SHARED_WORKER_NAME)
  })

  it('does not probe WebGL on a page that is not isolated', () => {
    const takes = vi.fn(() => true)
    geometryWorkerName({ isolated: false, takes })
    expect(takes).not.toHaveBeenCalled()
  })
})
