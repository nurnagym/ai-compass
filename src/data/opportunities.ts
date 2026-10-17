import type { Domain, LifeArea } from '../types/session'

export interface Opportunity {
  id: string
  lifeArea: LifeArea
  domain: Domain
  title: string
  toolIds: string[]
  workflow: string[]
}

// Curated workflows use capabilities from the existing verified catalog, without live search.
export const opportunities: Opportunity[] = [
  {
    id: 'work-coding',
    lifeArea: 'work',
    domain: 'coding',
    title: 'Разобраться в небольшом фрагменте кода',
    toolIds: ['codex', 'claude-code', 'aider', 'cline'],
    workflow: [
      'Выберите небольшой несекретный фрагмент собственного кода.',
      'Попросите объяснить его работу и предложить проверочный тест.',
      'Запустите проверку самостоятельно и сверьте объяснение с поведением программы.',
    ],
  },
  {
    id: 'work-voice',
    lifeArea: 'work',
    domain: 'audio',
    title: 'Превратить собственную рабочую голосовую заметку в текст',
    toolIds: ['buzz', 'handy', 'whisper'],
    workflow: [
      'Запишите свою короткую несекретную рабочую заметку.',
      'Попробуйте расшифровку записи в выбранном инструменте.',
      'Исправьте ошибки и выделите следующие действия.',
    ],
  },
  {
    id: 'work-writing',
    lifeArea: 'work',
    domain: 'writing',
    title: 'Подготовить черновик рабочего письма или резюме',
    toolIds: ['gpt4all', 'jan', 'ollama', 'lmstudio'],
    workflow: [
      'Возьмите короткий вымышленный пример письма или резюме без личных данных.',
      'Попросите предложить более ясную версию, сохраняя факты.',
      'Проверьте каждое утверждение и отредактируйте текст перед отправкой.',
    ],
  },
  {
    id: 'work-documents',
    lifeArea: 'work',
    domain: 'research',
    title: 'Найти ответ в рабочих документах',
    toolIds: ['khoj', 'anythingllm', 'open-notebook'],
    workflow: [
      'Добавьте один несекретный рабочий документ.',
      'Задайте конкретный вопрос по его содержанию.',
      'Сверьте ответ с исходным документом.',
    ],
  },
  {
    id: 'learning-sources',
    lifeArea: 'learning',
    domain: 'research',
    title: 'Разобраться в учебном материале с опорой на источник',
    toolIds: ['open-notebook', 'khoj', 'gpt4all'],
    workflow: [
      'Выберите короткий открытый учебный текст.',
      'Попросите выделить основные идеи и объяснить незнакомые понятия.',
      'Проверьте объяснение по тексту и сформулируйте собственный вывод.',
    ],
  },
  {
    id: 'learning-practice',
    lifeArea: 'learning',
    domain: 'learning',
    title: 'Устроить себе короткую тренировку по новой теме',
    toolIds: ['jan', 'ollama', 'open-notebook'],
    workflow: [
      'Назовите знакомую вам учебную тему и свой уровень.',
      'Попросите объяснение на простом примере и три вопроса для самопроверки.',
      'Проверьте ответы по надёжному учебному источнику.',
    ],
  },
  {
    id: 'creative-photo',
    lifeArea: 'creativity',
    domain: 'design',
    title: 'Попробовать улучшить небольшую фотографию',
    toolIds: ['upscayl', 'chainner'],
    workflow: [
      'Сохраните копию небольшой фотографии, которую можно использовать для теста.',
      'Попробуйте увеличение изображения в выбранном инструменте.',
      'Сравните детали с оригиналом: AI может добавить неточности.',
    ],
  },
  {
    id: 'creative-video',
    lifeArea: 'creativity',
    domain: 'video',
    title: 'Сравнить качество короткого видеоролика до и после обработки',
    toolIds: ['real-video', 'video2x', 'chainner'],
    workflow: [
      'Возьмите копию короткого собственного ролика.',
      'Попробуйте улучшение качества с базовыми настройками.',
      'Сравните результат с оригиналом и оцените время обработки.',
    ],
  },
  {
    id: 'creative-writing',
    lifeArea: 'creativity',
    domain: 'writing',
    title: 'Превратить задумку в несколько вариантов истории',
    toolIds: ['gpt4all', 'jan', 'ollama'],
    workflow: [
      'Опишите вымышленную творческую задумку в двух предложениях.',
      'Попросите три разных направления для её развития.',
      'Выберите интересный ход и напишите свою версию.',
    ],
  },
  {
    id: 'everyday-planning',
    lifeArea: 'everyday',
    domain: 'everyday',
    title: 'Составить черновой план для повседневного дела',
    toolIds: ['gpt4all', 'jan', 'ollama'],
    workflow: [
      'Опишите несекретное бытовое дело или поездку без адресов и личных данных.',
      'Попросите разбить подготовку на короткие шаги.',
      'Самостоятельно проверьте сроки, условия и актуальные сведения.',
    ],
  },
  {
    id: 'everyday-documents',
    lifeArea: 'everyday',
    domain: 'research',
    title: 'Быстрее разобраться в инструкции',
    toolIds: ['khoj', 'gpt4all'],
    workflow: [
      'Возьмите общедоступную инструкцию без персональных данных.',
      'Попросите объяснить один непонятный пункт.',
      'Сверьте объяснение с оригиналом; важные решения проверяйте у специалиста.',
    ],
  },
  {
    id: 'relationships-message',
    lifeArea: 'relationships',
    domain: 'writing',
    title: 'Подобрать ясную формулировку для сообщения',
    toolIds: ['gpt4all', 'jan', 'ollama'],
    workflow: [
      'Опишите вымышленную ситуацию общения без имён и личной переписки.',
      'Попросите несколько спокойных вариантов сообщения с одинаковым смыслом.',
      'Выберите слова, которые соответствуют вашему намерению.',
    ],
  },
  {
    id: 'relationships-voice',
    lifeArea: 'relationships',
    domain: 'communication',
    title: 'Превратить собственную голосовую заметку в текст',
    toolIds: ['buzz', 'handy'],
    workflow: [
      'Запишите свою короткую несекретную мысль.',
      'Попробуйте расшифровать запись.',
      'Исправьте ошибки и используйте текст как основу сообщения.',
    ],
  },
]
