import { z } from 'zod'

export const sampleEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  file: z.string().endsWith('.stl'),
  name: z.string().min(1),
  description: z.string().min(1),
  units: z.enum(['mm', 'in']),
  bodies: z.number().int().positive(),
  expectedCreaseSeams: z.number().int().nonnegative(),
})

export const sampleManifestSchema = z
  .object({
    version: z.literal(1),
    samples: z.array(sampleEntrySchema).min(1),
  })
  .refine((m) => new Set(m.samples.map((s) => s.id)).size === m.samples.length, {
    message: 'Sample ids must be unique.',
  })

export type SampleEntry = z.infer<typeof sampleEntrySchema>
export type SampleManifest = z.infer<typeof sampleManifestSchema>
