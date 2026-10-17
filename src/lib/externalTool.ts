import { z } from 'zod'
import { website } from './website'
export const websiteSchema = z.string().refine((v) => website(v) !== null)
export const externalToolSchema = z
  .object({
    id: z.string().min(1).max(150),
    name: z.string().min(1).max(120),
    officialUrl: websiteSchema,
    description: z.string().max(500),
    source: z.enum(['sheet', 'web']),
    sourceUrl: websiteSchema,
    checkedAt: z.iso.datetime(),
    limitations: z.array(z.string().max(300)).max(5),
    contextSources: z
      .array(z.object({ url: websiteSchema, row: z.number().int().min(1) }).strict())
      .max(4),
  })
  .strict()
// Restored display data never goes back to the scoring engine or to OpenAI.
export const resolvedRecommendationSchema = z
  .object({
    opportunityId: z.string().min(1).max(80),
    opportunity: z.string().min(1).max(260),
    why: z.string().min(1).max(1200),
    workflow: z.array(z.string().min(1).max(300)).min(2).max(3),
    tool: externalToolSchema,
  })
  .strict()
