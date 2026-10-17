import { describe, expect, it } from 'vitest'
import { buildMemory, extractDemoClaims, emptyMemory } from '../src/features/onboarding/memory'
import { evaluateTool, rankTools } from '../src/features/evidence/evaluator'
import { demoNext, introduction, personas } from '../src/features/onboarding/director'
import { initialSession, sessionReducer } from '../src/features/onboarding/machine'
import { questionSchema, requestSchema, validateQuestion } from '../src/lib/schemas'
import { estimateEIG, shouldFinishDiscovery } from '../src/features/evidence/scoring'
import { toolById, catalog, verifiedCatalog } from '../src/data/catalog'
import type { Claim, Interaction } from '../src/types/session'
const h = (answer: string, id = 'step-1'): Interaction => ({
  id,
  answer,
  question: introduction,
  skipped: !answer,
})
const claim = (overrides: Partial<Claim> = {}): Claim => ({
  kind: 'fact',
  text: 'Читаю документы',
  quote: 'Читаю документы',
  sourceId: 'step-1',
  domain: 'research',
  negative: false,
  toolId: null,
  ...overrides,
})
describe('evidence provenance and memory', () => {
  it('keeps hypotheses separate and out of ranking', () => {
    const m = buildMemory([claim({ kind: 'hypothesis' })], [h('Читаю документы')])
    expect(m.hypotheses).toHaveLength(1)
    expect(m.confirmedFacts).toHaveLength(0)
    expect(rankTools(m, [h('Читаю документы')]).every((r) => r.exploratory)).toBe(true)
  })
  it('rejects fabricated quotes, unknown sources and skipped answers', () => {
    expect(buildMemory([claim()], [h('Привет')]).confirmedFacts).toHaveLength(0)
    expect(
      buildMemory([claim({ sourceId: 'nope' })], [h('Читаю документы')]).confirmedFacts,
    ).toHaveLength(0)
    expect(
      buildMemory([claim()], [{ ...h('Читаю документы'), skipped: true }]).confirmedFacts,
    ).toHaveLength(0)
  })
  it('retains explicit goals with source IDs', () => {
    const m = buildMemory([claim({ kind: 'goal' })], [h('Читаю документы')])
    expect(m.goals[0].sourceId).toBe('step-1')
  })
  it('retains contradictions and disqualifies conflicting candidates', () => {
    const history = [h('Читаю документы'), h('Не читаю документы', 'step-2')]
    const m = buildMemory(
      [claim(), claim({ quote: 'Не читаю документы', sourceId: 'step-2', negative: true })],
      history,
    )
    expect(m.contradictions).toHaveLength(1)
    expect(evaluateTool(toolById('anythingllm')!, m, history)).toBeNull()
  })
  it('does not classify unfamiliar products as already used', () => {
    const m = buildMemory(extractDemoClaims([h('Не знаком: GPT4All; Знаю: Buzz')]), [
      h('Не знаком: GPT4All; Знаю: Buzz'),
    ])
    expect(m.toolsUsed).toHaveLength(0)
  })
  it('detects use only within that product clause', () => {
    const history = [h('Использую: GPT4All; Не знаком: Buzz')]
    const m = buildMemory(extractDemoClaims(history), history)
    expect(m.toolsUsed.map((t) => t.toolId)).toEqual(['gpt4all'])
  })
  it('deduplicates claims', () =>
    expect(buildMemory([claim(), claim()], [h('Читаю документы')]).confirmedFacts).toHaveLength(1))
})
describe('readiness, constraints and ranking', () => {
  it('requires multiple source interactions for a strong recommendation', () => {
    const history = [h('Читаю документы'), h('Исследую документы', 'step-2')]
    const m = buildMemory(extractDemoClaims(history), history)
    const r = evaluateTool(toolById('anythingllm')!, m, history)!
    expect(r.exploratory).toBe(false)
    expect(r.score).toBe(100)
    expect(
      evaluateTool(toolById('anythingllm')!, buildMemory([claim()], [history[0]]), [history[0]])!
        .exploratory,
    ).toBe(true)
  })
  it('excludes unverified products and known incompatibilities', () => {
    const history = [h('Читаю документы. Только в браузере')]
    const m = buildMemory(extractDemoClaims(history), history)
    expect(evaluateTool(toolById('jan')!, m, history)).toBeNull()
    expect(evaluateTool(toolById('chatgpt')!, m, history)).toBeNull()
  })
  it('does not recommend advanced local setups to unspecified consumers', () =>
    expect(
      rankTools(emptyMemory(), [h('Привет')]).some(
        (r) => toolById(r.toolId)?.requiredExperience === 'advanced',
      ),
    ).toBe(false))
  it('does not confuse denial of programming experience with technical skill', () => {
    const history = [h('Не умею программировать. Хочу исследовать документы.')]
    const m = buildMemory(extractDemoClaims(history), history)
    expect(
      rankTools(m, history).every((r) => toolById(r.toolId)?.requiredExperience !== 'advanced'),
    ).toBe(true)
  })
  it('ranks supported needs above unrelated products and caps at 3', () => {
    const history = [h('Улучшаю фотографии'), h('Хочу улучшать изображения', 'step-2')]
    const result = rankTools(buildMemory(extractDemoClaims(history), history), history)
    expect(result.length).toBeLessThanOrEqual(3)
    expect(result[0].score).toBeGreaterThan(70)
    expect(toolById(result[0].toolId)!.supportedUseCases).toContain('design')
  })
  it('prioritizes practical constraints and excludes already asked titles', () => {
    const constraint = {
      ...introduction,
      id: 'constraints',
      targetGap: 'constraints' as const,
      title: 'Где пробовать инструмент?',
    }
    const familiar = {
      ...constraint,
      targetGap: 'familiarity' as const,
      title: 'Какие приложения знакомы?',
    }
    expect(estimateEIG(constraint, emptyMemory(), [])).toBeGreaterThan(
      estimateEIG(familiar, emptyMemory(), []),
    )
    expect(
      estimateEIG(constraint, emptyMemory(), [{ ...h('Только в браузере'), question: constraint }]),
    ).toBe(-1000)
  })
  it('enforces independent coverage and a hard budget before completion', () => {
    expect(shouldFinishDiscovery(emptyMemory(), [h('Документы')], [], 0)).toBe(false)
    expect(
      shouldFinishDiscovery(
        emptyMemory(),
        Array.from({ length: 4 }, (_, i) => h('Документы', `step-${i}`)),
        [],
        0,
      ),
    ).toBe(false)
    expect(
      shouldFinishDiscovery(
        emptyMemory(),
        Array.from({ length: 7 }, (_, i) => h('', `step-${i}`)),
        [],
        100,
      ),
    ).toBe(true)
  })
  it('has 30 source-verified active catalog entries with HTTPS URLs', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(30)
    expect(catalog.length).toBeLessThanOrEqual(50)
    expect(verifiedCatalog.length).toBeGreaterThanOrEqual(30)
    for (const tool of verifiedCatalog) {
      expect(tool.lastVerifiedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new URL(tool.officialUrl).protocol).toBe('https:')
      expect(tool.verificationSource).toContain('raw.githubusercontent.com')
    }
  })
})
describe('director and state machine', () => {
  it.each(personas.map((p) => [p.id, p.text]))(
    'terminates the %s demo journey within budget',
    (id, text) => {
      const history: Interaction[] = []
      let q = introduction
      let result
      for (let i = 0; i < 7; i++) {
        history.push({
          id: `step-${i + 1}`,
          answer: i === 0 ? text : i === 3 ? 'Могу установить приложение на компьютер' : text,
          question: q,
          skipped: false,
        })
        result = demoNext(history)
        if (!result.question) break
        q = result.question
      }
      expect(result?.action, id).toBe('RECOMMEND')
      expect(result?.recommendations.length).toBeGreaterThan(0)
      expect(history.length).toBeLessThanOrEqual(7)
    },
  )
  it('changes follow-ups according to the answer', () => {
    expect(demoNext([h(personas[0].text)]).question?.title).not.toBe(
      demoNext([h(personas[1].text)]).question?.title,
    )
  })
  it('terminates vague and fully skipped sessions without inventing certainty', () => {
    for (const answer of ['', 'не знаю']) {
      const history = Array.from({ length: 7 }, (_, i) => h(answer, `step-${i + 1}`))
      const result = demoNext(history)
      expect(result.question).toBeNull()
      expect(result.recommendations.every((r) => r.exploratory)).toBe(true)
    }
  })
  it('prevents empty and duplicate in-flight submissions', () => {
    let s = sessionReducer(initialSession(), { type: 'START' })
    expect(sessionReducer(s, { type: 'SUBMIT', interaction: { ...h(''), skipped: false } })).toBe(s)
    s = sessionReducer(s, { type: 'SUBMIT', interaction: h('Читаю документы') })
    expect(sessionReducer(s, { type: 'SUBMIT', interaction: h('дубликат') })).toBe(s)
  })
  it('back discards evidence from changed answers and restart erases history', () => {
    let s = sessionReducer(initialSession(), { type: 'START' })
    s = sessionReducer(s, { type: 'SUBMIT', interaction: h('Читаю документы') })
    s = sessionReducer(s, { type: 'RESOLVE', result: demoNext(s.history) })
    s = sessionReducer(s, { type: 'BACK' })
    expect(s.history).toEqual([])
    expect(s.result).toBeNull()
    s = sessionReducer(s, { type: 'RESTART' })
    expect(s).toEqual(initialSession())
  })
  it('requires a real first open answer in the state machine and request schema', () => {
    const state = sessionReducer(initialSession(), { type: 'START' })
    expect(state.question.component).toBe('VoiceTextQuestion')
    expect(sessionReducer(state, { type: 'SUBMIT', interaction: h('') })).toBe(state)
    expect(requestSchema.safeParse({ mode: 'demo', history: [h('')] }).success).toBe(false)
    expect(
      requestSchema.safeParse({
        mode: 'demo',
        history: [{ ...h('Моя задача'), question: { ...introduction, component: 'ChoiceCards' } }],
      }).success,
    ).toBe(false)
    expect(
      requestSchema.safeParse({ mode: 'demo', history: [h('Хочу разобраться в документе')] })
        .success,
    ).toBe(true)
  })
  it('recovers from API failure without losing the current interaction', () => {
    let s = sessionReducer(initialSession(), { type: 'START' })
    s = sessionReducer(s, { type: 'SUBMIT', interaction: h('Привет') })
    s = sessionReducer(s, { type: 'FAIL', message: 'Unavailable' })
    expect(s.phase).toBe('ERROR')
    expect(s.history).toHaveLength(1)
    expect(sessionReducer(s, { type: 'RETRY' }).phase).toBe('EVALUATING')
  })
  it('rejects arbitrary components, URLs as assets and excessive histories', () => {
    expect(questionSchema.safeParse({ ...introduction, component: '<script>' }).success).toBe(false)
    expect(
      questionSchema.safeParse({
        ...introduction,
        component: 'ChoiceCards',
        options: [{ id: 'a', label: 'a', description: '', assetId: 'https://evil.com' }],
      }).success,
    ).toBe(false)
    expect(
      requestSchema.safeParse({ mode: 'demo', history: Array(8).fill(h('Привет')) }).success,
    ).toBe(false)
    expect(validateQuestion({ ...introduction, component: 'ThisOrThat' })).toBe(false)
  })
})
