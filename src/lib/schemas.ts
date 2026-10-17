import { z } from 'zod'
import { domains, assetIds, componentTypes, lifeAreas, MAX_STEPS } from '../types/session'
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
    lifeArea: z.enum(lifeAreas).optional(),
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
    lifeArea: z.enum(lifeAreas).optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict()
// Only the shape goes to OpenAI; bounded claim/question validation runs on the server.
// Do not put completion decisions or readiness scores in the model contract.
const plain = z.string()
const modelSignalSchema = z
  .object({
    kind: z.enum(['fact', 'goal', 'interest', 'tool']),
    text: plain,
    quote: plain,
    sourceId: plain,
    domain: z.enum(domains),
    lifeArea: z.enum(lifeAreas),
    confidence: z.number(),
    negative: z.boolean(),
    toolId: plain.nullable(),
  })
  .strict()
export const modelQuestionSchema = z
  .object({
    id: plain,
    component: z.enum(componentTypes),
    title: plain,
    description: plain,
    options: z.array(
      z.object({ id: plain, label: plain, description: plain, assetId: z.enum(assetIds) }).strict(),
    ),
    multiple: z.boolean(),
    targetGap: z.enum([...domains, 'familiarity', 'constraints']),
    lifeArea: z.enum(lifeAreas).nullable(),
  })
  .strict()
export const directorModelSchema = z
  .object({
    signals: z.array(modelSignalSchema),
    hypotheses: z.array(
      z
        .object({
          text: plain,
          quote: plain,
          sourceId: plain,
          domain: z.enum(domains),
          lifeArea: z.enum(lifeAreas),
        })
        .strict(),
    ),
    candidateQuestions: z.array(modelQuestionSchema),
  })
  .strict()
export const turnRequestSchema = z
  .object({
    session: z
      .object({
        version: z.literal(1),
        mode: z.enum(['demo', 'live']),
        history: z.array(interactionSchema).max(MAX_STEPS - 1),
        signals: z.array(claimSchema).max(28).optional(),
      })
      .strip(), // Cached result/metrics may be round-tripped but are never trusted.
    answer: interactionSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const combined = requestSchema.safeParse({
      mode: value.session.mode,
      history: [...value.session.history, value.answer],
    })
    if (!combined.success)
      ctx.addIssue({ code: 'custom', message: 'Invalid turn history or introduction' })
  })
export function validateQuestion(q: z.infer<typeof questionSchema>): boolean {
  if (new Set(q.options.map((o) => o.id)).size !== q.options.length) return false
  if (q.component === 'VoiceTextQuestion') return q.options.length === 0
  if (q.component === 'ThisOrThat') return q.options.length === 2
  return q.options.length >= 2 && q.options.length <= 6
}
