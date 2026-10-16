import { useState } from 'react'
import { Clock3, Plus, MessageSquare, LayoutGrid } from 'lucide-react'
import { useAnswerTimer, ANSWER_SECONDS } from '../../hooks/useAnswerTimer'
import { Button } from '../ui/button'
import { InteractionRenderer, VoiceTextQuestion, type InteractionProps } from './Interactions'
interface Props extends InteractionProps {
  timerEnabled: boolean
  onTimerEnabledChange: (enabled: boolean) => void
  paused?: boolean
}
export function QuestionExperience({
  timerEnabled,
  onTimerEnabledChange,
  paused = false,
  ...props
}: Props) {
  const [writeOwn, setWriteOwn] = useState(
    Boolean(
      props.initialAnswer &&
      !props.question.options.some((o) => o.label === props.initialAnswer) &&
      !['SwipeCards', 'AppRecognition'].includes(props.question.component),
    ),
  )
  const [draft, setDraft] = useState(props.initialAnswer ?? '')
  const [voiceBusy, setVoiceBusy] = useState(false)
  const timer = useAnswerTimer(timerEnabled, paused || voiceBusy)
  return (
    <div className="question-experience">
      <div className={`answer-timer ${timer.expired && timerEnabled ? 'timer-expired' : ''}`}>
        <div className="timer-caption">
          <Clock3 size={16} />
          <span>
            {!timerEnabled
              ? 'В своём темпе'
              : timer.paused
                ? 'Таймер на паузе'
                : timer.expired
                  ? 'Одного короткого ответа достаточно'
                  : `${ANSWER_SECONDS} секунд на ${props.question.component === 'VoiceTextQuestion' || writeOwn ? 'короткий ответ' : 'выбор'}`}
          </span>
        </div>
        {timerEnabled && (
          <span className="timer-value" role="timer" aria-live="off" aria-label="Осталось времени">
            {String(Math.floor(timer.remaining / 60)).padStart(2, '0')}:
            {String(timer.remaining % 60).padStart(2, '0')}
          </span>
        )}
        <div className="timer-controls">
          {timerEnabled && (
            <button type="button" onClick={timer.extend} aria-label="Добавить 20 секунд">
              <Plus size={13} />
              20 с
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!timerEnabled) timer.reset()
              onTimerEnabledChange(!timerEnabled)
            }}
          >
            {timerEnabled ? 'Без таймера' : 'Включить таймер'}
          </button>
        </div>
      </div>
      {timer.expired && timerEnabled && (
        <p className="timer-nudge" role="status">
          Время вышло. Можно ответить сейчас, добавить 20 секунд или продолжить без таймера.
        </p>
      )}
      {writeOwn || props.question.component === 'VoiceTextQuestion' ? (
        <>
          <p className="own-answer-hint">
            {props.question.id === 'intro'
              ? 'Можно рассказать об учёбе, работе или увлечениях.'
              : 'Можно ответить в нескольких словах.'}
          </p>
          <VoiceTextQuestion
            {...props}
            initialAnswer={draft}
            onDraftChange={setDraft}
            onBusyChange={setVoiceBusy}
          />
        </>
      ) : (
        <InteractionRenderer {...props} onProgress={timer.reset} />
      )}
      {props.question.component !== 'VoiceTextQuestion' && (
        <Button
          variant="ghost"
          className="answer-format-toggle"
          disabled={voiceBusy}
          onClick={() => setWriteOwn((value) => !value)}
        >
          {writeOwn ? <LayoutGrid size={15} /> : <MessageSquare size={15} />}{' '}
          {writeOwn ? 'Вернуться к вариантам' : 'Ответить своими словами'}
        </Button>
      )}
    </div>
  )
}
