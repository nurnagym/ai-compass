import { z } from 'zod'
import { domains, assetIds, componentTypes, MAX_STEPS } from '../types/session'
const text = (n: number) => z.string().trim().min(1).max(n)
export const optionSchema = z
  .object({
    id: text(50),
    label: text(120),
    description: z.string().max(200),
    assetId: z.enum(assetIds),
  })
  .strict()
export const questionSchema = z
  .object({
    id: text(60),
    component: z.enum(componentTypes),
    title: text(260),
    description: z.string().max(300),
    options: z.array(optionSchema).max(6),
    multiple: z.boolean(),
    targetGap: z.enum([...domains, 'familiarity', 'constraints', 'introduction']),
  })
  .strict()
export const interactionSchema = z
  .object({
    id: text(60),
    question: questionSchema,
    answer: z.string().trim().max(1800),
    skipped: z.boolean(),
  })
  .strict()
export const requestSchema = z
  .object({
    mode: z.enum(['demo', 'live']),
    history: z.array(interactionSchema).min(1).max(MAX_STEPS),
  })
  .strict()
  .superRefine((value, ctx) => {
    const first = value.history[0]
    if (
      first &&
      (first.skipped ||
        first.question.id !== 'intro' ||
        first.question.component !== 'VoiceTextQuestion' ||
        first.question.options.length)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['history', 0],
        message: 'A non-empty open introduction is required',
      })
    if (new Set(value.history.map((h) => h.id)).size !== value.history.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate interaction IDs' })
    for (const h of value.history)
      if (!h.skipped && !h.answer) ctx.addIssue({ code: 'custom', message: 'Empty answer' })
  })
export const claimSchema = z
  .object({
    kind: z.enum(['fact', 'goal', 'interest', 'tool', 'hypothesis']),
    text: text(240),
    quote: text(240),
    sourceId: text(60),
    domain: z.enum(domains),
    negative: z.boolean(),
    toolId: z.string().max(60).nullable(),
  })
  .strict()
// No arbitrary HTML, assets, URLs, catalog entries, or layout structures are accepted.
export const directorSchema = z
  .object({
    action: z.enum(['ASK', 'CLARIFY', 'EXPLORE', 'VALIDATE', 'RECOMMEND']),
    claims: z.array(claimSchema).max(28),
    question: questionSchema.nullable(),
  })
  .strict()
export function validateQuestion(q: z.infer<typeof questionSchema>): boolean {
  if (new Set(q.options.map((o) => o.id)).size !== q.options.length) return false
  if (q.component === 'VoiceTextQuestion') return q.options.length === 0
  if (q.component === 'ThisOrThat') return q.options.length === 2
  return q.options.length >= 2 && q.options.length <= 6
}
