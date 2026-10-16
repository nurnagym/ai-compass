import { describe, expect, it } from 'vitest'
import { decide, demoNext, introduction } from '../src/features/onboarding/director'
import { buildMemory, extractDemoClaims } from '../src/features/onboarding/memory'
import { rankTools } from '../src/features/evidence/evaluator'
import type { Interaction, Question } from '../src/types/session'
function selectedAnswer(question: Question, persona: string): string {
  if (question.id === 'intro') return question.options.find((o) => o.id === persona)!.label
  if (question.targetGap === 'constraints')
    return question.options.find((o) => o.id === 'desktop')!.label
  if (question.component === 'SwipeCards')
    return question.options.map((o) => `Интересно: ${o.label}`).join('; ')
  if (question.component === 'AppRecognition')
    return question.options.map((o) => `Не знаком: ${o.label}`).join('; ')
  return question.options[0].label
}
describe('quick adaptive journey policy', () => {
  it.each(['student', 'creative', 'office', 'everyday'])(
    'finishes %s with real selections and an early swipe',
    (persona) => {
      const history: Interaction[] = []
      let question = introduction
      let result
      for (let i = 0; i < 7; i++) {
        history.push({
          id: `step-${i + 1}`,
          question,
          answer: selectedAnswer(question, persona),
          skipped: false,
        })
        result = demoNext(history)
        if (!result.question) break
        question = result.question
      }
      expect(result?.question).toBeNull()
      expect(result?.recommendations.length).toBeGreaterThan(0)
      expect(history.length).toBeGreaterThanOrEqual(4)
      expect(history.length).toBeLessThanOrEqual(7)
      expect(history.slice(0, 3).some((h) => h.question.component === 'SwipeCards')).toBe(true)
      expect(new Set(history.map((h) => h.question.component)).size).toBeGreaterThanOrEqual(3)
      expect(history.every((h) => h.question.component !== 'VoiceTextQuestion')).toBe(true)
      expect(history.some((h) => h.question.targetGap === 'constraints')).toBe(true)
    },
  )
  it('lets the concrete second answer change the next question content', () => {
    const first: Interaction = {
      id: 'step-1',
      question: introduction,
      answer: 'Работа и рутина',
      skipped: false,
    }
    const q = demoNext([first]).question!
    const forWriting = demoNext([
      first,
      { id: 'step-2', question: q, answer: 'Написать письма', skipped: false },
    ]).question!
    const forAudio = demoNext([
      first,
      { id: 'step-2', question: q, answer: 'Расшифровать запись встречи', skipped: false },
    ]).question!
    expect(forWriting.component).toBe('SwipeCards')
    expect(forAudio.component).toBe('SwipeCards')
    expect(forWriting.targetGap).toBe('writing')
    expect(forAudio.targetGap).toBe('communication')
    expect(forWriting.options[0].label).not.toBe(forAudio.options[0].label)
  })
  it('does not let category diversity crowd out a stronger photography match', () => {
    const history: Interaction[] = [
      { id: 'step-1', question: introduction, answer: 'Фотографии и видео', skipped: false },
      { id: 'step-2', question: introduction, answer: 'Улучшать фотографии', skipped: false },
      {
        id: 'step-3',
        question: { ...introduction, component: 'SwipeCards' },
        answer:
          'Интересно: Улучшать фотографии; Интересно: Улучшать качество видео; Интересно: Писать тексты для публикаций',
        skipped: false,
      },
    ]
    const ranked = rankTools(buildMemory(extractDemoClaims(history), history), history)
    expect(ranked.map((r) => r.toolId)).toContain('upscayl')
    expect(ranked.find((r) => r.toolId === 'upscayl')!.score).toBeGreaterThanOrEqual(90)
  })
  it('assigns a fresh application step ID even when the model repeats the intro ID', () => {
    const history: Interaction[] = [
      { id: 'step-1', question: introduction, answer: 'Учёба и исследования', skipped: false },
    ]
    const proposed: Question = {
      ...introduction,
      component: 'ThisOrThat',
      title: 'Что полезнее сейчас?',
      options: introduction.options.slice(0, 2),
      targetGap: 'research',
    }
    expect(
      decide(history, extractDemoClaims(history), { action: 'ASK', question: proposed }, 'live')
        .question?.id,
    ).toBe('question-2')
  })
  it('does not repeat a skipped constraint question or loop on an all-skipped journey', () => {
    let question = introduction
    const history: Interaction[] = []
    let result
    for (let i = 0; i < 7; i++) {
      history.push({ id: `step-${i + 1}`, question, answer: '', skipped: true })
      result = demoNext(history)
      if (!result.question) break
      question = result.question
    }
    expect(result?.question).toBeNull()
    expect(result?.recommendations.every((r) => r.exploratory)).toBe(true)
    expect(history.filter((h) => h.question.targetGap === 'constraints')).toHaveLength(1)
  })
  it('prevents a live proposal from restoring mandatory essays, hiding swipes or finishing early', () => {
    const history: Interaction[] = [
      { id: 'step-1', question: introduction, answer: 'Учёба и исследования', skipped: false },
    ]
    const voice: Question = {
      ...introduction,
      id: 'broad',
      component: 'VoiceTextQuestion',
      title: 'Расскажите всё о себе',
      options: [],
    }
    const second = decide(
      history,
      extractDemoClaims(history),
      { action: 'RECOMMEND', question: voice },
      'live',
    )
    expect(second.question?.component).toBe('ScenarioGame')
    expect(second.action).not.toBe('RECOMMEND')
    history.push({
      id: 'step-2',
      question: second.question!,
      answer: second.question!.options[0].label,
      skipped: false,
    })
    expect(
      decide(history, extractDemoClaims(history), { action: 'ASK', question: voice }, 'live')
        .question?.component,
    ).toBe('SwipeCards')
  })
  it('keeps rejecting a particular swipe separate from a blanket factual contradiction', () => {
    const history: Interaction[] = [
      { id: 'step-1', question: introduction, answer: 'Фотографии и видео', skipped: false },
      {
        id: 'step-2',
        question: introduction,
        answer: 'Интересно: Улучшать фотографии; Не интересно: Улучшать качество видео',
        skipped: false,
      },
    ]
    const memory = buildMemory(extractDemoClaims(history), history)
    expect(memory.interests.some((c) => c.negative && c.domain === 'video')).toBe(true)
    expect(memory.contradictions).toEqual([])
    expect(rankTools(memory, history).some((r) => r.toolId === 'upscayl')).toBe(true)
  })
  it('does not infer video needs or contradictions from an unfamiliar product name', () => {
    const history: Interaction[] = [
      { id: 'step-1', question: introduction, answer: 'Фотографии и видео', skipped: false },
      {
        id: 'step-2',
        question: { ...introduction, component: 'AppRecognition', targetGap: 'familiarity' },
        answer: 'Не знаком: REAL Video Enhancer; Не знаком: GPT4All',
        skipped: false,
      },
    ]
    const memory = buildMemory(extractDemoClaims(history), history)
    expect(memory.contradictions).toEqual([])
    expect(memory.confirmedFacts.every((c) => c.sourceId !== 'step-2')).toBe(true)
    expect(memory.toolsUsed).toEqual([])
  })
  it('does not promote unselected quick-choice options to evidence', () => {
    const history = [
      { id: 'step-1', question: introduction, answer: 'Повседневные дела', skipped: false },
    ]
    const memory = buildMemory(extractDemoClaims(history), history)
    expect(memory.confirmedFacts.map((c) => c.domain)).toEqual(['everyday'])
  })
})
