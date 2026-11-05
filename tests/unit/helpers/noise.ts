import { seededRandom } from './random'

// Every distinct vertex position moves by its own offset of at most amplitude mm per axis, and vertices that coincide
// move together, so the mesh stays closed.
export function perturbSoup(soup: Float32Array, amplitudeMm: number, seed: number): Float32Array {
  const out = new Float32Array(soup.length)
  const offsets = new Map<string, number[]>()
  const random = seededRandom(seed)
  for (let i = 0; i < soup.length; i += 3) {
    const key = `${soup[i]},${soup[i + 1]},${soup[i + 2]}`
    let offset = offsets.get(key)
    if (!offset) {
      offset = [0, 1, 2].map(() => (random() * 2 - 1) * amplitudeMm)
      offsets.set(key, offset)
    }
    for (let c = 0; c < 3; c++) out[i + c] = soup[i + c]! + offset[c]!
  }
  return out
}

// The triangles in another order, each starting at another corner: the mesh is the same, but chains, loops and
// edge numbers start somewhere else.
export function shuffleSoup(soup: Float32Array, seed: number): Float32Array {
  const count = soup.length / 9
  const order = Array.from({ length: count }, (_, i) => i)
  const random = seededRandom(seed)
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  const out = new Float32Array(soup.length)
  order.forEach((t, k) => {
    const turn = Math.floor(random() * 3)
    for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) out[k * 9 + v * 3 + c] = soup[t * 9 + ((v + turn) % 3) * 3 + c]!
  })
  return out
}
