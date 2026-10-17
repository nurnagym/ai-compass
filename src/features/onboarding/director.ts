import { domainNames } from '../evidence/evaluator'
import {
  buildRecommendations,
  calculateCoverage,
  estimateEIG,
  shouldFinishDiscovery,
  updateHypotheses,
} from '../evidence/scoring'
import { defaultLifeArea, normalized, areaNames, claimArea } from './lifeAreas'
import { validateQuestion } from '../../lib/schemas'
import { buildMemory, extractDemoClaims } from './memory'
import {
  MAX_STEPS,
  lifeAreas,
  type LifeArea,
  type QuestionCandidate,
  type Claim,
  type DirectorResult,
  type Domain,
  type Interaction,
  type Memory,
  type Option,
  type Question,
} from '../../types/session'
const option = (
  id: string,
  label: string,
  assetId: Option['assetId'],
  description = '',
): Option => ({
  id,
  label,
  assetId,
  description,
})
export const introduction: Question = {
  id: 'intro',
  component: 'VoiceTextQuestion',
  title: 'Расскажите немного о себе.',
  description: 'Чем вы занимаетесь и что вам интересно? Достаточно пары фраз.',
  options: [],
  multiple: false,
  targetGap: 'introduction',
}
// Fixtures for exercising distinct backgrounds and interests; real users choose their own activities, not a fictional profile.
export const personas = [
  {
    id: 'student',
    text: 'Я студент. Читаю исследовательские статьи и работаю с таблицами Excel.',
  },
  {
    id: 'creative',
    text: 'Я фотограф. Люблю снимать портреты и видео о событиях.',
  },
  {
    id: 'office',
    text: 'Я работаю в офисе. В моём дне много документов, встреч и переписки.',
  },
  {
    id: 'everyday',
    text: 'Люблю путешествовать и писать тексты о повседневной жизни. С AI пока не знаком.',
  },
] as const
export function primaryDomain(memory: Memory): Domain {
  return (
    [
      ...memory.goals.toReversed(),
      ...memory.confirmedFacts.toReversed(),
      ...memory.interests.toReversed(),
    ].find((c) => !c.negative && !memory.contradictions.some((d) => d.domain === c.domain))
      ?.domain ?? 'everyday'
  )
}
function quickChoice(domain: Domain, id: string): Question {
  const base = {
    id,
    multiple: false,
    targetGap: domain,
    description: 'Выберите то, что ближе. Здесь нет правильного ответа.',
  }
  if (['research', 'learning', 'data'].includes(domain))
    return {
      ...base,
      component: 'ScenarioGame',
      title: 'Чему вы чаще уделяете время?',
      options: [
        option('research', 'Читаю статьи и документы', 'research'),
        option('learning', 'Изучаю новые темы', 'education'),
        option('data', 'Работаю с таблицами и данными', 'analytics'),
      ],
    }
  if (['productivity', 'communication', 'audio'].includes(domain))
    return {
      ...base,
      component: 'ScenarioGame',
      title: 'Что чаще встречается в вашем дне?',
      options: [
        option('documents', 'Документы и заметки', 'research'),
        option('audio', 'Встречи и разговоры', 'audio'),
        option('writing', 'Письма', 'writing'),
      ],
    }
  if (['design', 'video'].includes(domain))
    return {
      ...base,
      component: 'ThisOrThat',
      title: 'Что вам ближе в творчестве?',
      options: [
        option('design', 'Фотографировать', 'creativity'),
        option('video', 'Снимать видео', 'video'),
      ],
    }
  if (domain === 'coding')
    return {
      ...base,
      component: 'ThisOrThat',
      title: 'Что вам ближе в разработке?',
      options: [
        option('coding', 'Разбираться в чужом коде', 'coding'),
        option('build', 'Писать свой код', 'coding'),
      ],
    }
  return {
    ...base,
    component: 'ThisOrThat',
    title: 'Какой текст встречается у вас чаще?',
    options: [
      option('writing', 'Письма и короткие сообщения', 'writing'),
      option('long-writing', 'Тексты с подробными объяснениями', 'writing'),
    ],
  }
}
function swipeQuestion(domain: Domain, id: string): Question {
  let options: Option[]
  if (['design', 'video'].includes(domain))
    options = [
      option('design', 'Улучшать фотографии', 'creativity'),
      option('video', 'Улучшать качество видео', 'video'),
      option('writing', 'Писать тексты для публикаций', 'writing'),
    ]
  else if (['research', 'learning', 'data'].includes(domain))
    options = [
      option('research', 'Задавать вопросы по документам', 'research'),
      option('learning', 'Объяснять сложные темы для учёбы', 'education'),
      option('presentations', 'Готовить презентации', 'productivity'),
    ]
  else if (domain === 'coding')
    options = [
      option('coding', 'Объяснять незнакомый код', 'coding'),
      option('tests', 'Писать код и тесты', 'coding'),
      option('research', 'Разбираться в документации', 'research'),
    ]
  else if (['productivity', 'communication', 'audio'].includes(domain))
    options = [
      option('audio', 'Расшифровывать записи встреч', 'audio'),
      option('research', 'Находить ответы в документах', 'research'),
      option('writing', 'Писать рабочие письма', 'writing'),
    ]
  else
    options = [
      option('writing', 'Помогать писать тексты', 'writing'),
      option('everyday', 'Объяснять повседневные вопросы', 'everyday'),
      option('audio', 'Вводить текст голосом', 'audio'),
    ]
  return {
    id,
    component: 'SwipeCards',
    title: 'Пригодилось бы вам?',
    description: 'Вправо — интересно, влево — пока нет. Можно нажимать кнопки.',
    options,
    multiple: false,
    targetGap: domain,
  }
}
function areaQuestion(area: LifeArea, history: Interaction[]): Question {
  const repeated = history.some((h) => h.question.lifeArea === area)
  const base = {
    id: `explore-${area}`,
    multiple: false,
    lifeArea: area,
    description: 'Выберите близкий вариант. Можно пропустить или ответить своими словами.',
  }
  const prefix = repeated ? `Что ещё вам близко в сфере ${areaNames[area]}?` : ''
  if (area === 'work')
    return {
      ...base,
      component: 'ScenarioGame',
      targetGap: 'productivity',
      title: prefix || 'Что чаще встречается в вашей работе или поиске работы?',
      options: [
        option('writing', 'Писать тексты и письма', 'writing'),
        option('research', 'Читать документы и заметки', 'research'),
        option('coding', 'Разбираться в коде и программах', 'coding'),
      ],
    }
  if (area === 'learning')
    return {
      ...base,
      component: 'ThisOrThat',
      targetGap: 'learning',
      title: prefix || 'Как вам интереснее узнавать новое для себя?',
      options: [
        option('research', 'Читать статьи и документы', 'research'),
        option('learning', 'Изучать темы на практике', 'education'),
      ],
    }
  if (area === 'creativity')
    return {
      ...base,
      component: 'ThisOrThat',
      targetGap: 'design',
      title: prefix || 'Что вам ближе в свободное время и увлечениях?',
      options: [
        option('design', 'Фотографировать и снимать видео', 'creativity'),
        option('writing', 'Писать истории и тексты', 'writing'),
      ],
    }
  if (area === 'everyday')
    return {
      ...base,
      component: 'ScenarioGame',
      targetGap: 'everyday',
      title: prefix || 'Что чаще встречается в вашей повседневной жизни?',
      options: [
        option('travel', 'Планировать поездки', 'everyday'),
        option('research', 'Разбираться в инструкциях и документах', 'research'),
        option('writing', 'Писать повседневные заметки', 'writing'),
      ],
    }
  return {
    ...base,
    component: 'ChoiceCards',
    targetGap: 'communication',
    title: prefix || 'Как вам привычнее делиться мыслями с друзьями и близкими?',
    options: [
      option('writing', 'Писать сообщения', 'writing'),
      option('audio', 'Записывать голосовые заметки', 'audio'),
      option('communication', 'Обсуждать вопросы в разговоре', 'communication'),
    ],
  }
}
function constraintQuestion(): Question {
  return {
    id: 'constraints',
    component: 'ChoiceCards',
    targetGap: 'constraints',
    title: 'Где вам удобно попробовать инструмент?',
    description: 'Один выбор поможет учесть ограничения.',
    multiple: false,
    options: [
      option('web', 'Только в браузере', 'everyday', 'Без установки'),
      option('desktop', 'Могу установить приложение на компьютер', 'productivity'),
      option('technical', 'Умею программировать и настраивать Python', 'coding'),
    ],
  }
}
function curatedCandidates(history: Interaction[], memory: Memory): Question[] {
  const pool = lifeAreas.map((area) => areaQuestion(area, history))
  const domain = primaryDomain(memory)
  const recentArea = history.at(-1)?.question.lifeArea ?? defaultLifeArea(domain)
  const primaryArea = [...memory.goals, ...memory.confirmedFacts, ...memory.interests].findLast(
    (c) => c.domain === domain && !c.negative,
  )
  const swipe = {
    ...swipeQuestion(domain, 'swipe'),
    lifeArea: recentArea,
    title: `Что из этого пригодилось бы для ${areaNames[recentArea]}?`,
  }
  const followup = {
    ...quickChoice(domain, 'followup'),
    lifeArea: primaryArea ? claimArea(primaryArea) : defaultLifeArea(domain),
  }
  return [...pool, swipe, followup, constraintQuestion()]
}
function questionAllowed(question: Question, history: Interaction[], memory: Memory): boolean {
  if (question.targetGap === 'introduction') return false
  if (
    !validateQuestion(question) ||
    history.some((h) => normalized(h.question.title) === normalized(question.title))
  )
    return false
  if (
    question.component === 'VoiceTextQuestion' &&
    (history.at(-1)?.question.component === 'VoiceTextQuestion' ||
      history.filter((h) => h.question.component === 'VoiceTextQuestion').length >= 2)
  )
    return false
  if (question.component === history.at(-1)?.question.component) return false
  if (history.length === 1 && ['constraints', 'familiarity'].includes(question.targetGap))
    return false
  if (history.length === 1) {
    const coverage = calculateCoverage(memory, history)
    if (coverage.areas.length && coverage.areas.some((a) => a.lifeArea === question.lifeArea))
      return false
  }
  return true
}
export function selectNextAction(
  history: Interaction[],
  memory: Memory,
  candidates: QuestionCandidate[],
) {
  let pool = candidates.filter((c) => questionAllowed(c.question, history, memory))
  if (history.length >= 2 && !history.some((h) => h.question.component === 'SwipeCards'))
    pool = pool.filter((c) => c.question.component === 'SwipeCards')
  else if (history.length >= 3 && !history.some((h) => h.question.targetGap === 'constraints'))
    pool = pool.filter((c) => c.question.targetGap === 'constraints')
  const scores = pool
    .map((candidate) => ({ ...candidate, score: estimateEIG(candidate.question, memory, history) }))
    .filter((c) => c.score > -1000)
    .sort((a, b) => b.score - a.score)
  const fallback = curatedCandidates(history, memory).find((q) =>
    questionAllowed(q, history, memory),
  ) ?? {
    ...areaQuestion(lifeAreas[history.length % lifeAreas.length], history),
    title: `Ещё один короткий выбор: ${history.length + 1}`,
    id: 'last-exploration',
  }
  return {
    question: scores[0]?.question ?? fallback,
    score: scores[0]?.score ?? 0,
    scores: scores.map((c) => ({ id: c.question.id, approximateEIG: c.score, source: c.source })),
  }
}
export function demoQuestion(history: Interaction[], memory: Memory): Question {
  return selectNextAction(
    history,
    memory,
    curatedCandidates(history, memory).map((question) => ({ question, source: 'curated' })),
  ).question
}
export function decide(
  history: Interaction[],
  claims: Claim[],
  proposal?: {
    action?: DirectorResult['action']
    question?: Question | null
    questions?: Question[]
  },
  mode: 'demo' | 'live' = 'demo',
  previousClaims: Claim[] = [],
): DirectorResult {
  const memory = buildMemory([...claims, ...previousClaims, ...extractDemoClaims(history)], history)
  const recommendations = buildRecommendations(memory, history)
  const modelQuestions = proposal?.questions ?? (proposal?.question ? [proposal.question] : [])
  const candidates: QuestionCandidate[] = [
    ...modelQuestions.map((q) => ({
      question: {
        ...q,
        lifeArea: ['constraints', 'familiarity'].includes(q.targetGap)
          ? undefined
          : (q.lifeArea ?? defaultLifeArea(q.targetGap as Domain)),
      },
      source: 'model' as const,
    })),
    ...curatedCandidates(history, memory).map((question) => ({
      question,
      source: 'curated' as const,
    })),
  ]
  const selection = selectNextAction(history, memory, candidates)
  const complete = shouldFinishDiscovery(memory, history, recommendations, selection.score)
  return {
    mode,
    action: complete ? 'RECOMMEND' : memory.contradictions.length ? 'CLARIFY' : 'EXPLORE',
    memory,
    question: complete ? null : { ...selection.question, id: `question-${history.length + 1}` },
    recommendations: complete ? recommendations : [],
    focus: {
      currentGoal: 'Узнать человека в разных сферах жизни и подобрать применимые возможности AI',
      currentHypothesis: `Проверяем несколько возможностей, включая ${domainNames[primaryDomain(memory)]}`,
      hypotheses: updateHypotheses(memory, history),
      coverage: calculateCoverage(memory, history),
      questionScores: selection.scores,
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
