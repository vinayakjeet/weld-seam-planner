import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../../../src/core/mesh/hash'

describe('sha256Hex', () => {
  it('hashes "abc" to the published digest', async () => {
    const bytes = new TextEncoder().encode('abc')
    expect(await sha256Hex(bytes.buffer as ArrayBuffer)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes an empty buffer to the digest of nothing', async () => {
    expect(await sha256Hex(new ArrayBuffer(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})
