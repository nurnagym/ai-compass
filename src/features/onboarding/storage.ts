import { z } from 'zod'
import { claimSchema, questionSchema, requestSchema, validateQuestion } from '../../lib/schemas'
import { verifiedCatalog } from '../../data/catalog'
import { MAX_STEPS, type Session } from '../../types/session'
import { decide, introduction } from './director'
import { initialSession } from './machine'
import { resolvedRecommendationSchema } from '../../lib/externalTool'
import { buildRecommendations } from '../evidence/scoring'

export const SESSION_KEY = 'ai-compass.session.v1'
const MAX_SNAPSHOT = 64000
const snapshotSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(['demo', 'live']),
    timerEnabled: z.boolean(),
    phase: z.enum(['WELCOME', 'INTRODUCTION', 'DISCOVERY', 'EVALUATING', 'RESULTS', 'ERROR']),
    history: z.array(requestSchema.shape.history.element).max(MAX_STEPS),
    question: questionSchema,
    claims: z.array(claimSchema).max(28),
    draft: z.string().max(1800),
    resolvedRecommendations: z.array(resolvedRecommendationSchema).min(1).max(3).optional(),
  })
  .strict()

export interface StoredSession {
  session: Session
  mode: 'demo' | 'live'
  timerEnabled: boolean
  draft: string
}

export function sanitizeSession(raw: unknown): StoredSession | null {
  const parsed = snapshotSchema.safeParse(raw)
  if (!parsed.success) return null
  const s = parsed.data
  if (!validateQuestion(s.question)) return null
  if (
    s.question.component === 'AppRecognition' &&
    s.question.options.some((o) => !verifiedCatalog.some((t) => t.id === o.id))
  )
    return null
  if (s.history.length && !requestSchema.safeParse({ mode: s.mode, history: s.history }).success)
    return null
  if (!s.history.length && !['WELCOME', 'INTRODUCTION'].includes(s.phase)) return null
  if (s.history.length && ['WELCOME', 'INTRODUCTION'].includes(s.phase)) return null
  if (!s.history.length && s.question.id !== introduction.id) return null
  const result = s.history.length
    ? decide(s.history, s.claims, { question: s.question }, s.mode)
    : null
  if (s.resolvedRecommendations) {
    if (!result || s.mode !== 'live' || s.phase !== 'RESULTS') return null
    const targets = buildRecommendations(result.memory, s.history, true)
    const saved = s.resolvedRecommendations
    if (
      targets.length !== saved.length ||
      new Set(saved.map((r) => r.opportunityId)).size !== targets.length
    )
      return null
    const recommendations = targets.map((target) => {
      const data = saved.find((r) => r.opportunityId === target.opportunityId)
      return data
        ? { ...target, ...data, toolId: data.tool.id, firstAction: data.workflow[0] }
        : null
    })
    if (recommendations.some((r) => !r)) return null
    result.recommendations = recommendations.filter((r) => r !== null)
    result.focus.candidateTools = result.recommendations.map((r) => r.toolId)
  }
  // Recompute all scores and recommendations; cached browser values never become authority.
  const phase = s.phase === 'EVALUATING' ? 'ERROR' : s.phase
  const session: Session = {
    ...initialSession(),
    phase,
    history: s.history,
    question: s.history.length ? s.question : introduction,
    result:
      s.phase === 'RESULTS' && result ? { ...result, action: 'RECOMMEND', question: null } : result,
    error:
      phase === 'ERROR'
        ? 'Предыдущий запрос был прерван. Можно повторить его или вернуться к ответу.'
        : null,
  }
  return { session, mode: s.mode, timerEnabled: s.timerEnabled, draft: s.draft }
}

export function readSession(): StoredSession | null {
  try {
    const value = sessionStorage.getItem(SESSION_KEY)
    if (!value) return null
    if (value.length > MAX_SNAPSHOT) {
      clearSession()
      return null
    }
    const restored = sanitizeSession(JSON.parse(value))
    if (!restored) clearSession()
    return restored
  } catch {
    clearSession()
    return null
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* Restricted/private browsing still works in memory. */
  }
}

export function saveSession(value: StoredSession) {
  if (value.session.phase === 'WELCOME') {
    clearSession()
    return
  }
  const memory = value.session.result?.memory
  const claims = memory
    ? [
        ...memory.confirmedFacts,
        ...memory.goals,
        ...memory.interests,
        ...memory.toolsUsed,
        ...memory.hypotheses,
      ].slice(0, 28)
    : []
  const snapshot = {
    version: 1,
    mode: value.mode,
    timerEnabled: value.timerEnabled,
    phase: value.session.phase,
    history: value.session.history,
    question: value.session.question,
    claims,
    draft: value.draft,
    ...(value.mode === 'live' &&
    value.session.phase === 'RESULTS' &&
    value.session.result?.recommendations.every((r) => r.tool)
      ? {
          resolvedRecommendations: value.session.result.recommendations.map((r) => ({
            opportunityId: r.opportunityId,
            opportunity: r.opportunity,
            why: r.why,
            workflow: r.workflow,
            tool: r.tool,
          })),
        }
      : {}),
  }
  try {
    const text = JSON.stringify(snapshot)
    if (text.length > MAX_SNAPSHOT) {
      clearSession()
      return
    }
    sessionStorage.setItem(SESSION_KEY, text)
  } catch {
    /* Storage is optional; no answers are sent elsewhere as a fallback. */
  }
}
