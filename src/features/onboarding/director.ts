import { catalog } from '../../data/catalog'
import { domainNames, questionPriority, rankTools, shouldFinish } from '../evidence/evaluator'
import { buildMemory, extractDemoClaims } from './memory'
import {
  MAX_STEPS,
  type Claim,
  type DirectorResult,
  type Domain,
  type Interaction,
  type Memory,
  type Option,
  type Question,
} from '../../types/session'
export const introduction: Question = {
  id: 'intro',
  component: 'VoiceTextQuestion',
  title: 'Расскажите немного о себе.',
  description:
    'Чем вы занимаетесь и что отнимает больше всего времени? Можно ответить в двух словах.',
  options: [],
  multiple: false,
  targetGap: 'introduction',
}
export const personas = [
  {
    id: 'student',
    label: 'Учусь и исследую',
    detail: 'Статьи, данные, новые знания',
    text: 'Я студент. Читаю исследовательские статьи и работаю с таблицами Excel. Хочу быстрее разбираться в источниках.',
    assetId: 'education',
  },
  {
    id: 'creative',
    label: 'Создаю и придумываю',
    detail: 'Фотография, дизайн, видео',
    text: 'Я фотограф и снимаю видео. Хочу улучшать качество изображений и тратить меньше времени на обработку.',
    assetId: 'creativity',
  },
  {
    id: 'office',
    label: 'Работаю и организую',
    detail: 'Документы, встречи, рутина',
    text: 'Я работаю в офисе. Много документов и повторяющихся задач. Хочу расшифровывать записи встреч и упорядочить заметки.',
    assetId: 'productivity',
  },
  {
    id: 'everyday',
    label: 'Просто любопытно',
    detail: 'Хочу понять, что мне подойдёт',
    text: 'Я пока не знаком с AI. Хочу помощника для повседневной жизни: объяснять сложное простыми словами и помогать писать тексты.',
    assetId: 'everyday',
  },
] as const
const option = (
  id: string,
  label: string,
  assetId: Option['assetId'],
  description = '',
): Option => ({ id, label, assetId, description })
export function primaryDomain(memory: Memory): Domain {
  return (
    [...memory.goals, ...memory.confirmedFacts, ...memory.interests].find(
      (c) => !c.negative && !memory.contradictions.some((d) => d.domain === c.domain),
    )?.domain ?? 'everyday'
  )
}
export function demoQuestion(history: Interaction[], memory: Memory): Question {
  const count = history.length,
    domain = primaryDomain(memory)
  const facts = [...memory.goals, ...memory.confirmedFacts].filter((c) => !c.negative)
  const quote = facts[0]?.quote.slice(0, 75)
  const base = {
    id: `question-${count + 1}`,
    multiple: false,
    targetGap: domain,
    description: '',
  } as Question
  if (count <= 2)
    return {
      ...base,
      component: 'VoiceTextQuestion',
      options: [],
      title:
        count === 1
          ? quote
            ? `Вы упомянули: «${quote}». Что здесь самое трудное?`
            : 'Что вы хотели бы делать проще или быстрее?'
          : quote
            ? `А какой результат для ${domainNames[domain]} был бы для вас полезным?`
            : 'Есть небольшая задача, которую вы давно откладываете?',
      description: 'Один конкретный пример поможет найти полезную идею.',
    }
  const asked = history.map((h) => h.question.targetGap)
  const contradiction = memory.contradictions.find(
    (c) => !asked.includes(c.domain) || history.at(-1)?.question.targetGap !== c.domain,
  )
  if (contradiction)
    return {
      ...base,
      targetGap: contradiction.domain,
      component: 'VoiceTextQuestion',
      options: [],
      title: `Уточним: задачи для ${domainNames[contradiction.domain]} сейчас актуальны?`,
      description:
        'В ответах есть разные сигналы. Исправьте предыдущий ответ кнопкой «Назад», если он был неточным.',
    }
  if (!asked.includes('constraints'))
    return {
      ...base,
      component: 'ChoiceCards',
      targetGap: 'constraints',
      title: 'Как вам удобнее попробовать новое?',
      description:
        'Это поможет учесть ограничения. Возможности инструментов зависят от устройства.',
      options: [
        option('web', 'Только в браузере', 'everyday', 'Без установки приложений'),
        option(
          'desktop',
          'Могу установить приложение на компьютер',
          'productivity',
          'Готов попробовать настольный инструмент',
        ),
        option(
          'technical',
          'Умею программировать и настраивать Python',
          'coding',
          'Техническая настройка меня не пугает',
        ),
      ],
    }
  if (!asked.includes('familiarity'))
    return {
      ...base,
      component: 'AppRecognition',
      targetGap: 'familiarity',
      title: 'Что вам уже знакомо?',
      description: 'Отметьте опыт знакомства. Можно выбрать «Не знаком» для всех.',
      options: ['gpt4all', 'anythingllm', 'upscayl', 'buzz'].map((id) => {
        const t = catalog.find((t) => t.id === id)!
        return option(
          t.id,
          t.name,
          t.category === 'design' ? 'creativity' : 'productivity',
          t.shortDescription,
        )
      }),
    }
  if (['design', 'video'].includes(domain))
    return {
      ...base,
      component: 'SwipeCards',
      title: 'Что хочется попробовать?',
      description: 'Вправо — интересно, влево — пока нет. Или используйте кнопки.',
      options: [
        option('image', 'Улучшать фотографии', 'creativity'),
        option('video', 'Улучшать качество видео', 'video'),
        option('writing', 'Писать тексты для публикаций', 'writing'),
      ],
    }
  if (['research', 'learning', 'data'].includes(domain))
    return {
      ...base,
      component: 'ScenarioGame',
      title: 'Завтра нужно разобраться в большом документе. С чего начнёте?',
      description: 'Здесь нет правильного ответа.',
      options: [
        option('read', 'Читаю документ и делаю заметки', 'research'),
        option('summary', 'Ищу краткое объяснение для учёбы', 'education'),
        option('ask', 'Задаю вопросы по документу', 'research'),
      ],
    }
  return {
    ...base,
    component: 'ThisOrThat',
    title: 'Что сейчас принесёт больше пользы?',
    description: 'Выберите то, что ближе к вашим задачам.',
    options: [
      option('writing', 'Писать тексты проще', 'writing'),
      option('audio', 'Расшифровывать голос и записи', 'audio'),
    ],
  }
}
export function decide(
  history: Interaction[],
  claims: Claim[],
  proposal?: { action: DirectorResult['action']; question: Question | null },
  mode: 'demo' | 'live' = 'demo',
): DirectorResult {
  const memory = buildMemory(claims, history),
    recommendations = rankTools(memory, history)
  const fallback = demoQuestion(history, memory)
  const proposed = proposal?.question
  // EIG heuristic rejects repeated evidence gaps; actual follow-up wording remains model-selected in live mode.
  const previousGaps = history.slice(3).map((h) => h.question.targetGap)
  let next =
    proposed && questionPriority(proposed.targetGap, memory, previousGaps) > 0 ? proposed : fallback
  if (history.length < 3)
    next = { ...next, component: 'VoiceTextQuestion', options: [], multiple: false }
  const priority = questionPriority(next.targetGap, memory, previousGaps)
  const complete = shouldFinish(
    recommendations,
    history.length,
    priority,
    memory.contradictions.length,
  )
  // The model's RECOMMEND action alone cannot terminate a session.
  return {
    mode,
    action: complete
      ? 'RECOMMEND'
      : memory.contradictions.length
        ? 'CLARIFY'
        : proposal?.action === 'RECOMMEND'
          ? 'EXPLORE'
          : (proposal?.action ?? 'ASK'),
    memory,
    question: complete ? null : next,
    recommendations: complete ? recommendations : [],
    focus: {
      currentGoal: 'Найти полезные инструменты с минимумом вопросов',
      currentHypothesis: `Проверяем возможности для ${domainNames[primaryDomain(memory)]}`,
      missingEvidence: memory.unknowns,
      candidateTools: recommendations.map((r) => r.toolId),
      currentStep: history.length,
      maxSteps: MAX_STEPS,
      completionStatus: complete
        ? history.length >= MAX_STEPS
          ? 'budget-reached'
          : 'ready'
        : 'collecting',
    },
  }
}
export function demoNext(history: Interaction[]): DirectorResult {
  return decide(history, extractDemoClaims(history))
}
