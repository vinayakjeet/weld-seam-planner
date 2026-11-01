import * as Comlink from 'comlink'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TIMEOUT_MS, watchWorker, wrapGeometryApi } from '../../../src/worker/client'
import type { GeometryApi } from '../../../src/worker/geometry.api'
import { DEFAULT_DETECT_SETTINGS } from '../../../src/core/seams/detect'
import { detected, fakeClient, readyOutcome } from '../helpers/state'

const ports: MessagePort[] = []
afterEach(() => {
  vi.useRealTimers()
  for (const port of ports.splice(0)) port.close()
})

function channel(api?: GeometryApi) {
  const { port1, port2 } = new MessageChannel()
  ports.push(port1, port2)
  if (api) Comlink.expose(api, port1)
  return port2
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function expectReadable(outcome: { status: string; error?: { what: string; why: string; next: string } }) {
  expect(outcome.status).toBe('error')
  for (const part of [outcome.error!.what, outcome.error!.why, outcome.error!.next]) expect(part.trim().length).toBeGreaterThan(0)
}

describe('worker call timeout', () => {
  it('is 30 seconds', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000)
  })

  it('answers with a readable error after 30 seconds of silence, and not before', async () => {
    vi.useFakeTimers()
    const client = wrapGeometryApi(channel())
    let settled = false
    const call = client.detect(DEFAULT_DETECT_SETTINGS, () => {}).then((outcome) => {
      settled = true
      return outcome
    })
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS - 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const outcome = await call
    expectReadable(outcome)
    if (outcome.status === 'error') expect(outcome.error.why).toContain('30 seconds')
  })

  it('covers loadStl and setUnits as well as detect', async () => {
    const client = wrapGeometryApi(channel(), { timeoutMs: 30 })
    expectReadable(await client.loadStl(new ArrayBuffer(8), 'a.stl', () => {}))
    expectReadable(await client.setUnits('mm', () => {}))
  })

  it('counts progress as a reply, so a slow but working load is not cut off', async () => {
    const api = fakeClient({
      loadStl: async (_b, _n, onProgress) => {
        for (let i = 1; i <= 5; i++) {
          await sleep(40)
          onProgress('weld', i / 5)
        }
        return readyOutcome()
      },
    })
    const outcome = await wrapGeometryApi(channel(api), { timeoutMs: 120 }).loadStl(new ArrayBuffer(8), 'a.stl', () => {})
    expect(outcome.status).toBe('ready')
  })

  it('times out when progress stops arriving', async () => {
    const api = fakeClient({
      loadStl: async (_b, _n, onProgress) => {
        onProgress('weld', 0.1)
        return new Promise(() => {})
      },
    })
    const started = Date.now()
    const outcome = await wrapGeometryApi(channel(api), { timeoutMs: 80 }).loadStl(new ArrayBuffer(8), 'a.stl', () => {})
    expectReadable(outcome)
    expect(Date.now() - started).toBeGreaterThanOrEqual(75)
  })

  it('tells the owner so it can replace a worker that stopped answering', async () => {
    let calls = 0
    const client = wrapGeometryApi(channel(), { timeoutMs: 20, onFailure: () => calls++ })
    await client.detect(DEFAULT_DETECT_SETTINGS, () => {})
    expect(calls).toBe(1)
  })

  it('does not report a failure for a call that answered in time', async () => {
    let calls = 0
    const client = wrapGeometryApi(channel(fakeClient({ detect: async () => detected([]) })), { timeoutMs: 200, onFailure: () => calls++ })
    expect((await client.detect(DEFAULT_DETECT_SETTINGS, () => {})).status).toBe('ok')
    await sleep(250)
    expect(calls).toBe(0)
  })
})

describe('worker failure', () => {
  it('answers at once with the browser message when the worker is known to be dead', async () => {
    let calls = 0
    const client = wrapGeometryApi(channel(), { failure: Promise.resolve('SyntaxError: Unexpected token'), onFailure: () => calls++ })
    const outcome = await client.loadStl(new ArrayBuffer(8), 'a.stl', () => {})
    expectReadable(outcome)
    if (outcome.status === 'error') expect(outcome.error.why).toContain('SyntaxError: Unexpected token')
    expect(calls).toBe(1)
    expectReadable(await client.detect(DEFAULT_DETECT_SETTINGS, () => {}))
  })

  it('passes an empty reply straight through instead of waiting for the timeout', async () => {
    const api = fakeClient({ detect: async () => undefined as never })
    let calls = 0
    const outcome = await wrapGeometryApi(channel(api), { timeoutMs: 150, onFailure: () => calls++ }).detect(DEFAULT_DETECT_SETTINGS, () => {})
    expect(outcome).toBeUndefined()
    expect(calls).toBe(0)
  })

  it('turns an error thrown inside the worker call into a readable error', async () => {
    const api = fakeClient({
      detect: async () => {
        throw new Error('boom inside worker')
      },
    })
    const outcome = await wrapGeometryApi(channel(api)).detect(DEFAULT_DETECT_SETTINGS, () => {})
    expectReadable(outcome)
    if (outcome.status === 'error') expect(outcome.error.why).toContain('boom inside worker')
  })
})

describe('watchWorker', () => {
  it('resolves with the message of an error event', async () => {
    const target = new EventTarget()
    const failure = watchWorker(target)
    target.dispatchEvent(Object.assign(new Event('error'), { message: 'Uncaught ReferenceError: x is not defined' }))
    expect(await failure).toContain('ReferenceError')
  })

  it('says so when the event has no message, as happens when a worker script fails to load', async () => {
    const target = new EventTarget()
    const failure = watchWorker(target)
    target.dispatchEvent(new Event('error'))
    expect((await failure).trim().length).toBeGreaterThan(0)
  })

  it('resolves for a message the browser could not read', async () => {
    const target = new EventTarget()
    const failure = watchWorker(target)
    target.dispatchEvent(new Event('messageerror'))
    expect((await failure).trim().length).toBeGreaterThan(0)
  })
})
