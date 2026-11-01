import { proxy, transfer, wrap, type Endpoint } from 'comlink'
import type { GeometryApi } from './geometry.api'

export type GeometryClient = GeometryApi

// loadStl moves the file's bytes to the worker, so the ArrayBuffer passed in is empty afterwards.
export function wrapGeometryApi(endpoint: Endpoint): GeometryClient {
  const remote = wrap<GeometryApi>(endpoint)
  return {
    loadStl: (buffer, name, onProgress) => remote.loadStl(transfer(buffer, [buffer]), name, proxy(onProgress)),
    setUnits: (units, onProgress) => remote.setUnits(units, proxy(onProgress)),
    detect: (settings, onProgress) => remote.detect(settings, proxy(onProgress)),
  }
}

export function createGeometryClient(): GeometryClient {
  return wrapGeometryApi(new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' }))
}

let shared: GeometryClient | null = null

export function getGeometryClient(): GeometryClient {
  shared ??= createGeometryClient()
  return shared
}
