// A page shares memory with the geometry worker only when it is cross-origin isolated and its WebGL accepts typed
// arrays that live in a SharedArrayBuffer. The second is not a given: a browser may throw or set a GL error on such a
// view, so the page tries it once and the worker is told by its name whether to share.
export const SHARED_WORKER_NAME = 'geometry-shared'
export const COPY_WORKER_NAME = 'geometry-copy'

type Gl = WebGLRenderingContext | WebGL2RenderingContext

function pageContext(): Gl | null {
  const canvas = document.createElement('canvas')
  return canvas.getContext('webgl2') ?? canvas.getContext('webgl')
}

// Uploads a shared vertex array and a shared index array to a throwaway context, as the viewport does for the part.
export function glTakesSharedBuffers(makeContext: () => Gl | null = pageContext): boolean {
  let gl: Gl | null = null
  try {
    gl = makeContext()
    if (!gl) return false
    // A WebGL buffer keeps the first target it is bound to, so each upload gets its own.
    const buffers: Array<WebGLBuffer | null> = []
    const upload = (target: number, data: ArrayBufferView): boolean => {
      const buffer = gl!.createBuffer()
      buffers.push(buffer)
      gl!.bindBuffer(target, buffer)
      gl!.bufferData(target, data, gl!.STATIC_DRAW)
      return gl!.getError() === gl!.NO_ERROR
    }
    const vertices = new Float32Array(new SharedArrayBuffer(36))
    const indices = new Uint32Array(new SharedArrayBuffer(12))
    const ok = upload(gl.ARRAY_BUFFER, vertices) && upload(gl.ELEMENT_ARRAY_BUFFER, indices)
    for (const buffer of buffers) gl.deleteBuffer(buffer)
    return ok
  } catch {
    return false
  } finally {
    try {
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      // the probe context is thrown away either way
    }
  }
}

interface NameOptions {
  isolated?: boolean
  takes?: () => boolean
}

let probed: boolean | undefined

export function geometryWorkerName({ isolated = globalThis.crossOriginIsolated === true, takes = glTakesSharedBuffers }: NameOptions = {}): string {
  if (!isolated || typeof SharedArrayBuffer !== 'function') return COPY_WORKER_NAME
  // The default probe is cached for the page; a probe passed in is always run.
  const answer = takes === glTakesSharedBuffers ? (probed ??= takes()) : takes()
  return answer ? SHARED_WORKER_NAME : COPY_WORKER_NAME
}
