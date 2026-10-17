import { describe, expect, it } from 'vitest'
import { decide, demoNext, introduction } from '../src/features/onboarding/director'
import { buildMemory, emptyMemory, extractDemoClaims } from '../src/features/onboarding/memory'
import {
  buildRecommendations,
  calculateCoverage,
  calculateRRS,
  estimateEIG,
  shouldFinishDiscovery,
  updateHypotheses,
} from '../src/features/evidence/scoring'
import { opportunities } from '../src/data/opportunities'
import { toolById } from '../src/data/catalog'
import type { Claim, Interaction, LifeArea, Question } from '../src/types/session'

function turn(answer: string, area: LifeArea = 'work', id = 'step-1'): Interaction {
  return {
    id,
    answer,
    skipped: !answer,
    question: {
      ...introduction,
      id: id === 'step-1' ? 'intro' : `question-${id}`,
      title: `Вопрос ${id}`,
      lifeArea: area,
    },
  }
}
const memoryFor = (history: Interaction[]) => buildMemory(extractDemoClaims(history), history)
const question = (area: LifeArea, title = 'Новый короткий выбор'): Question => ({
  ...introduction,
  id: `explore-${area}`,
  component: 'ThisOrThat',
  title,
  targetGap: 'writing',
  lifeArea: area,
  options: [
    { id: 'a', label: 'Писать тексты', description: '', assetId: 'writing' },
    { id: 'b', label: 'Читать документы', description: '', assetId: 'research' },
  ],
})

describe('independent life areas and explicit prototype heuristics', () => {
  it('explores another life area after a job-search introduction instead of recommending career tools', () => {
    const first = { ...turn('Ищу работу'), question: introduction }
    const result = demoNext([first])
    expect(result.action).toBe('EXPLORE')
    expect(result.recommendations).toEqual([])
    expect(result.question?.lifeArea).not.toBe('work')
    expect(result.focus.hypotheses!.length).toBeGreaterThan(1)
    expect(result.focus.coverage?.independentAreas).toBe(1)
    expect(result.focus.questionScores!.length).toBeGreaterThan(1)
  })
  it('does not mistake several technical topics inside work for independently explored life areas', () => {
    const history = [turn('На работе пишу тексты и читаю документы. Работаю с таблицами Excel.')]
    expect(calculateCoverage(memoryFor(history), history).independentAreas).toBe(1)
  })
  it('does not increase coverage or evidence by replaying an identical answer in a different area', () => {
    const history = [turn('Пишу рабочие тексты'), turn('Пишу рабочие тексты', 'learning', 'step-2')]
    const memory = memoryFor(history)
    const first = opportunities.find((o) => o.id === 'work-writing')!
    expect(calculateCoverage(memory, history).independentAreas).toBe(1)
    expect(calculateRRS(first, memory, history)).toBe(
      calculateRRS(first, memoryFor(history.slice(0, 1)), history.slice(0, 1)),
    )
  })
  it('updates coverage, hypotheses and readiness when a new independently answered area appears', () => {
    const before = [turn('Пишу рабочие тексты')]
    const after = [...before, turn('Люблю учиться и читать статьи', 'learning', 'step-2')]
    expect(calculateCoverage(memoryFor(before), before).independentAreas).toBe(1)
    expect(calculateCoverage(memoryFor(after), after).independentAreas).toBe(2)
    expect(updateHypotheses(memoryFor(after), after)).not.toEqual(
      updateHypotheses(memoryFor(before), before),
    )
    const opportunity = opportunities.find((o) => o.id === 'work-writing')!
    expect(calculateRRS(opportunity, memoryFor(after), after)).toBeGreaterThan(
      calculateRRS(opportunity, memoryFor(before), before),
    )
  })
  it('reduces hypothesis confidence when the matching evidence is contradicted', () => {
    const positive = [turn('Пишу рабочие тексты')]
    const negative = [...positive, turn('Не пишу рабочие тексты', 'work', 'step-2')]
    const find = (history: Interaction[]) =>
      updateHypotheses(memoryFor(history), history).find((h) => h.id === 'work-writing')!
    expect(find(positive).confidence).toBeGreaterThan(0)
    expect(find(negative)).toMatchObject({ confidence: 0, status: 'contradicted' })
  })
  it('does not treat text preferences from different life areas as a factual contradiction', () => {
    const history = [
      turn('Не пишу рабочие письма'),
      turn('Пишу истории для творчества', 'creativity', 'step-2'),
    ]
    expect(memoryFor(history).contradictions).toEqual([])
  })
  it('does not promote a model hypothesis or its confidence into evidence', () => {
    const history = [turn('Пишу рабочие тексты')]
    const hypothesis: Claim = {
      kind: 'hypothesis',
      text: 'Возможно пригодится черновик письма',
      quote: history[0].answer,
      sourceId: 'step-1',
      domain: 'writing',
      lifeArea: 'work',
      negative: false,
      toolId: null,
      confidence: 1,
    }
    const memory = buildMemory([hypothesis], history)
    expect(
      calculateRRS(
        opportunities.find((o) => o.id === 'work-writing')!,
        memory,
        history,
      ),
    ).toBe(0)
    expect(memory.hypotheses[0].confidence).toBeLessThan(1)
    expect(
      updateHypotheses(memory, history).some(
        (h) => h.text === hypothesis.text && h.status === 'tentative',
      ),
    ).toBe(true)
  })
  it('rejects unsupported medical conclusions even if they cite a real sentence', () => {
    const history = [turn('Ищу работу')]
    const claim: Claim = {
      kind: 'hypothesis',
      text: 'У вас депрессия',
      quote: 'Ищу работу',
      sourceId: 'step-1',
      domain: 'everyday',
      negative: false,
      toolId: null,
    }
    expect(buildMemory([claim], history).hypotheses).toEqual([])
  })
  it('prefers an independent area over revisiting the first topic and excludes repeated titles', () => {
    const history = [turn('Пишу рабочие тексты')],
      memory = memoryFor(history)
    expect(estimateEIG(question('learning'), memory, history)).toBeGreaterThan(
      estimateEIG(question('work'), memory, history),
    )
    expect(estimateEIG(question('learning', history[0].question.title), memory, history)).toBe(
      -1000,
    )
  })
  it('keeps final completion outside the model and refuses narrow early completion', () => {
    const history = [turn('Ищу работу')],
      memory = memoryFor(history)
    expect(
      decide(history, extractDemoClaims(history), { action: 'RECOMMEND', question: null }, 'live')
        .question,
    ).not.toBeNull()
    expect(shouldFinishDiscovery(memory, history, buildRecommendations(memory, history), 0)).toBe(
      false,
    )
  })
  it('builds practical workflows in different life areas from local verified compatible tools', () => {
    const history = [
      turn('Пишу рабочие тексты'),
      turn('Люблю учиться и читать статьи', 'learning', 'step-2'),
      turn('Могу установить приложение на компьютер', 'everyday', 'step-3'),
    ]
    const results = buildRecommendations(memoryFor(history), history)
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results.length).toBeLessThanOrEqual(3)
    expect(new Set(results.map((r) => r.lifeArea)).size).toBe(results.length)
    if (results.filter((r) => r.sourceIds.length).length >= 2)
      expect(results.every((r) => r.sourceIds.length > 0)).toBe(true)
    for (const result of results) {
      expect(toolById(result.toolId)?.verificationStatus).toBe('verified')
      expect(result.workflow!.length).toBeGreaterThanOrEqual(2)
      expect(result.firstAction).toBeTruthy()
      expect(
        result.evidenceQuotes.every((quote) => history.some((h) => h.answer.includes(quote))),
      ).toBe(true)
    }
  })
  it('keeps coding discoveries available to a developer while exploring other areas', () => {
    const history = [
      turn('Я разработчик и пишу код'),
      turn('Разбираюсь в программном коде каждый день', 'work', 'step-2'),
      turn('Люблю учиться и читать статьи', 'learning', 'step-3'),
    ]
    expect(
      buildRecommendations(memoryFor(history), history).some(
        (r) => r.opportunityId === 'work-coding',
      ),
    ).toBe(true)
  })
  it('respects browser-only constraints without inventing compatible products', () => {
    const history = [turn('Пишу рабочие тексты'), turn('Только в браузере', 'everyday', 'step-2')]
    expect(
      buildRecommendations(memoryFor(history), history).every((r) =>
        toolById(r.toolId)?.supportedPlatforms.includes('web'),
      ),
    ).toBe(true)
  })
  it('finishes vague and skipped journeys within the budget with no repeated question titles', () => {
    const history: Interaction[] = []
    let q = introduction
    let result
    for (let i = 0; i < 7; i++) {
      history.push({ id: `step-${i + 1}`, question: q, answer: i ? '' : 'Не знаю', skipped: i > 0 })
      result = demoNext(history)
      if (!result.question) break
      q = result.question
    }
    expect(result?.question).toBeNull()
    expect(result?.recommendations.every((r) => r.exploratory)).toBe(true)
    expect(new Set(history.map((h) => h.question.title)).size).toBe(history.length)
    expect(calculateCoverage(emptyMemory(), history).independentAreas).toBe(0)
  })
})
