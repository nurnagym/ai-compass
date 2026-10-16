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
    title: 'Что вам ближе в свободное время?',
    options: [
      option('writing', 'Писать тексты и делиться мыслями', 'writing'),
      option('learning', 'Читать и изучать новое', 'education'),
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
export function demoQuestion(history: Interaction[], memory: Memory): Question {
  const count = history.length,
    domain = primaryDomain(memory),
    id = `question-${count + 1}`
  const used = new Set(history.map((h) => h.question.component))
  const asked = history.map((h) => h.question.targetGap)
  const contradiction = memory.contradictions[0]
  if (contradiction)
    return {
      id,
      component: 'ChoiceCards',
      title: `Задачи для ${domainNames[contradiction.domain]} сейчас актуальны?`,
      description: 'Если прежний ответ был неточным, исправьте его кнопкой «Назад».',
      multiple: false,
      targetGap: contradiction.domain,
      options: [
        option('yes', `Да, нужна помощь для ${domainNames[contradiction.domain]}`, 'everyday'),
        option(
          'no',
          `Нет, сейчас не нужна помощь для ${domainNames[contradiction.domain]}`,
          'everyday',
        ),
      ],
    }
  if (count === 1) return quickChoice(domain, id)
  // Surface the previously hidden swipe interaction before the first completion decision.
  if (!used.has('SwipeCards')) return swipeQuestion(domain, id)
  if (!asked.includes('constraints'))
    return {
      id,
      component: 'ChoiceCards',
      targetGap: 'constraints',
      title: 'Где вам удобно попробовать инструмент?',
      description: 'Один выбор. Это поможет учесть ограничения.',
      multiple: false,
      options: [
        option('web', 'Только в браузере', 'everyday', 'Без установки'),
        option('desktop', 'Могу установить приложение на компьютер', 'productivity'),
        option('technical', 'Умею программировать и настраивать Python', 'coding'),
      ],
    }
  if (!asked.includes('familiarity')) {
    const ids = [
      ...new Set([
        ...rankTools(memory, history).map((r) => r.toolId),
        'gpt4all',
        'upscayl',
        'buzz',
      ]),
    ].slice(0, 3)
    return {
      id,
      component: 'AppRecognition',
      targetGap: 'familiarity',
      title: 'Что из этого вам знакомо?',
      description: 'Три быстрые отметки — без объяснений.',
      multiple: false,
      options: ids.map((toolId) => {
        const t = catalog.find((t) => t.id === toolId)!
        return option(
          t.id,
          t.name,
          t.category === 'design' ? 'creativity' : 'productivity',
          t.shortDescription,
        )
      }),
    }
  }
  if (!used.has('ScenarioGame'))
    return {
      id,
      component: 'ScenarioGame',
      title: 'Нужно написать важное сообщение. С чего начнёте?',
      description: 'Выберите привычный вариант.',
      multiple: false,
      targetGap: 'writing',
      options: [
        option('draft', 'Пишу текст с нуля', 'writing'),
        option('ideas', 'Ищу примеры текстов', 'writing'),
        option('edit', 'Прошу помочь отредактировать текст', 'writing'),
      ],
    }
  return quickChoice(domain, id)
}
export function decide(
  history: Interaction[],
  claims: Claim[],
  proposal?: { action: DirectorResult['action']; question: Question | null },
  mode: 'demo' | 'live' = 'demo',
): DirectorResult {
  const memory = buildMemory(claims, history),
    recommendations = rankTools(memory, history)
  const fallback = demoQuestion(history, memory),
    proposed = proposal?.question
  const seenSwipe = history.some((h) => h.question.component === 'SwipeCards')
  const hasConstraints = history.some((h) => h.question.targetGap === 'constraints')
  const repeatedQuestion = proposed && history.some((h) => h.question.title === proposed.title)
  const usableProposal =
    proposed &&
    !(
      proposed.component === 'VoiceTextQuestion' &&
      history.filter((h) => h.question.component === 'VoiceTextQuestion').length >= 2
    ) &&
    !repeatedQuestion &&
    proposed.component !== history.at(-1)?.question.component
  // After the required open introduction, the director selects a format; avoid consecutive open questions and long interviews.
  let next = usableProposal ? proposed : fallback
  if (history.length >= 2 && !seenSwipe && next.component !== 'SwipeCards') next = fallback
  if (history.length >= 3 && seenSwipe && !hasConstraints && next.targetGap !== 'constraints')
    next = fallback
  // The application owns step IDs so a repeated model ID cannot retain a prior answer timer.
  next = { ...next, id: `question-${history.length + 1}` }
  const askedInFormat = history
    .filter((h) => h.question.component === next.component)
    .map((h) => h.question.targetGap)
  const priority = questionPriority(next.targetGap, memory, askedInFormat)
  const complete =
    shouldFinish(recommendations, history.length, priority, memory.contradictions.length) &&
    (hasConstraints || history.length >= MAX_STEPS)
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
      currentGoal: 'Узнать занятия и интересы человека и подобрать полезные инструменты',
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
