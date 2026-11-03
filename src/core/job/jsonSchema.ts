import { z } from 'zod'
import { jobSchema, SCHEMA_URL } from './schema'

// The text of public/schema/weld-job-1.0.json. A test and the build compare it with the committed file.
export function renderJobSchema(): string {
  const generated = z.toJSONSchema(jobSchema, { target: 'draft-2020-12' })
  const { $schema, ...rest } = generated
  return JSON.stringify({ $schema, $id: SCHEMA_URL, title: 'Weld job 1.0', ...rest }, null, 2) + '\n'
}
