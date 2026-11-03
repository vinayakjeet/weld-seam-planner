import { z } from 'zod'
import { jobSchema, SCHEMA_URL } from './schema'

// Input mode: a field with a default (nearClearanceDeg) is optional for a reader, so files written earlier still validate.
// The text of public/schema/weld-job-1.0.json. A test and the build compare it with the committed file.
export function renderJobSchema(): string {
  const generated = z.toJSONSchema(jobSchema, { target: 'draft-2020-12', io: 'input' })
  const { $schema, ...rest } = generated
  return JSON.stringify({ $schema, $id: SCHEMA_URL, title: 'Weld job 1.0', ...rest }, null, 2) + '\n'
}
