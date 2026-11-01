import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sampleManifestSchema, type SampleManifest } from '../../../src/core/samples/manifest'

const SAMPLES_DIR = fileURLToPath(new URL('../../../public/samples/', import.meta.url))

export function readSample(id: string): ArrayBuffer {
  const bytes = readFileSync(`${SAMPLES_DIR}${id}.stl`)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export function readManifest(): SampleManifest {
  const text = readFileSync(`${SAMPLES_DIR}manifest.json`, 'utf8')
  return sampleManifestSchema.parse(JSON.parse(text))
}
