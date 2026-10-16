import { useState } from 'react'
import { componentTypes, type Question } from '../../types/session'
import { InteractionRenderer } from './Interactions'
import { Button } from '../ui/button'
const options: Question['options'] = [
  {
    id: 'research',
    label: 'Разобраться в источниках',
    description: 'Статьи, документы и новые знания',
    assetId: 'research',
  },
  {
    id: 'design',
    label: 'Создать что-то новое',
    description: 'Изображения, тексты и идеи',
    assetId: 'creativity',
  },
  {
    id: 'audio',
    label: 'Расшифровать аудио',
    description: 'Записи и голосовые заметки',
    assetId: 'audio',
  },
]
export function Gallery({ onClose }: { onClose: () => void }) {
  const [component, setComponent] = useState<(typeof componentTypes)[number]>('ChoiceCards'),
    [answer, setAnswer] = useState('')
  const question: Question = {
    id: component,
    component,
    title:
      component === 'ScenarioGame'
        ? 'Завтра нужно прочитать большой документ. С чего начнёте?'
        : 'Что хотелось бы делать проще?',
    description: 'Галерея компонентов · без обращения к AI',
    targetGap: 'research',
    multiple: true,
    options:
      component === 'VoiceTextQuestion'
        ? []
        : component === 'ThisOrThat'
          ? options.slice(0, 2)
          : options,
  }
  return (
    <main className="gallery shell">
      <Button variant="ghost" onClick={onClose}>
        ← Вернуться
      </Button>
      <h1>Библиотека взаимодействий</h1>
      <div className="gallery-tabs">
        {componentTypes.map((c) => (
          <button
            key={c}
            aria-pressed={component === c}
            onClick={() => {
              setComponent(c)
              setAnswer('')
            }}
          >
            {c}
          </button>
        ))}
      </div>
      <section className="question-panel">
        <p className="eyebrow">{component}</p>
        <h2>{question.title}</h2>
        <p className="question-description">{question.description}</p>
        <InteractionRenderer
          key={component}
          question={question}
          onSubmit={setAnswer}
          onSkip={() => setAnswer('Пропущено')}
        />
        <output className="gallery-output">{answer && `Ответ: ${answer}`}</output>
      </section>
    </main>
  )
}
