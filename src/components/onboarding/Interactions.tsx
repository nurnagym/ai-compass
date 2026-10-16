import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Check, Mic, Square, X, ThumbsUp, ThumbsDown } from 'lucide-react'
import { Button } from '../ui/button'
import { assets } from '../../data/assets'
import { useRecorder } from '../../hooks/useRecorder'
import { ru } from '../../lib/i18n'
import type { Question } from '../../types/session'
export interface InteractionProps {
  question: Question
  onSubmit: (answer: string) => void
  onSkip: () => void
  initialAnswer?: string
  live?: boolean
  onBusyChange?: (busy: boolean) => void
  onDraftChange?: (text: string) => void
  onProgress?: () => void
}
export function VoiceTextQuestion({
  question,
  onSubmit,
  onSkip,
  initialAnswer = '',
  live = false,
  onBusyChange,
  onDraftChange,
}: InteractionProps) {
  const [text, setText] = useState(initialAnswer),
    [transcript, setTranscript] = useState(false)
  const voice = useRecorder((t) => {
    setText(t)
    setTranscript(true)
  }, live)
  const required = question.id === 'intro'
  const busy = voice.status !== 'idle'
  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])
  useEffect(() => {
    onDraftChange?.(text)
  }, [text, onDraftChange])
  return (
    <div className="voice-question">
      <div className="answer-box">
        <label className="sr-only" htmlFor="answer">
          Ваш ответ
        </label>
        <textarea
          id="answer"
          maxLength={1800}
          required={required}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            required
              ? 'Например: учусь на экономиста, люблю фотографировать и путешествовать.'
              : 'Напишите короткий ответ…'
          }
          rows={3}
          disabled={busy}
        />
        <div className="answer-tools">
          <span>{text.length} / 1800</span>
          <button
            type="button"
            className={`mic-button ${voice.status === 'recording' ? 'recording' : ''}`}
            aria-label={voice.status === 'recording' ? 'Остановить запись' : 'Записать голосом'}
            disabled={voice.status === 'transcribing' || voice.status === 'requesting'}
            onClick={voice.status === 'recording' ? voice.stop : voice.start}
          >
            {voice.status === 'recording' ? <Square size={17} /> : <Mic size={18} />}
            <span>
              {voice.status === 'recording'
                ? `Запись · ${voice.seconds} / 45 с`
                : voice.status === 'transcribing'
                  ? 'Распознаём…'
                  : voice.status === 'requesting'
                    ? 'Доступ к микрофону…'
                    : 'Голосом'}
            </span>
          </button>
        </div>
      </div>
      {busy && (
        <Button variant="ghost" onClick={voice.cancel}>
          <X size={16} />
          Отменить запись
        </Button>
      )}
      {transcript && (
        <p className="helper" role="status">
          Текст распознан. Проверьте и отредактируйте его перед отправкой.
        </p>
      )}
      {voice.error && (
        <p className="inline-error" role="alert">
          {voice.error}
        </p>
      )}
      <div className="question-actions">
        <Button onClick={() => onSubmit(text.trim())} disabled={!text.trim() || busy}>
          {ru.continue}
          <ArrowRight size={17} />
        </Button>
        {!required && (
          <Button variant="ghost" onClick={onSkip} disabled={busy}>
            {ru.skip}
          </Button>
        )}
      </div>
      <p className="helper">
        {question.targetGap === 'introduction'
          ? 'Пары фраз достаточно. Начнём с ваших занятий и интересов.'
          : 'Можно ответить коротко — или пропустить.'}
      </p>
    </div>
  )
}
export function ChoiceCards({ question, onSubmit, onSkip }: InteractionProps) {
  const [selected, setSelected] = useState<string[]>([])
  function toggle(id: string) {
    if (!question.multiple) {
      onSubmit(question.options.find((option) => option.id === id)!.label)
      return
    }
    setSelected((prev) =>
      question.multiple ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id],
    )
  }
  return (
    <div>
      <div className="choice-grid" role="group" aria-label={question.title}>
        {question.options.map((o) => {
          const Icon = assets[o.assetId],
            active = selected.includes(o.id)
          return (
            <motion.button
              key={o.id}
              type="button"
              whileTap={{ scale: 0.98 }}
              className={`choice-card ${active ? 'selected' : ''}`}
              aria-pressed={question.multiple ? active : undefined}
              onClick={() => toggle(o.id)}
            >
              <span className="asset-tile">
                <Icon size={24} />
              </span>
              <span className="choice-copy">
                <strong>{o.label}</strong>
                {o.description && <small>{o.description}</small>}
              </span>
              <span className="check-circle">
                {question.multiple ? active && <Check size={14} /> : <ArrowRight size={14} />}
              </span>
            </motion.button>
          )
        })}
      </div>
      <div className="question-actions">
        {question.multiple && (
          <Button
            disabled={!selected.length}
            onClick={() =>
              onSubmit(
                question.options
                  .filter((o) => selected.includes(o.id))
                  .map((o) => o.label)
                  .join('; '),
              )
            }
          >
            {ru.continue}
            <ArrowRight size={17} />
          </Button>
        )}
        <Button variant="ghost" onClick={onSkip}>
          {ru.skip}
        </Button>
      </div>
    </div>
  )
}
export function ThisOrThat({ question, onSubmit, onSkip }: InteractionProps) {
  return (
    <div>
      <div className="comparison">
        {question.options.map((o, i) => {
          const Icon = assets[o.assetId]
          return (
            <motion.button
              key={o.id}
              className={`comparison-card comparison-${i}`}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSubmit(o.label)}
            >
              <Icon size={40} strokeWidth={1.3} />
              <strong>{o.label}</strong>
              <span>
                Выбрать <ArrowRight size={16} />
              </span>
            </motion.button>
          )
        })}
        <span className="or-label">или</span>
      </div>
      <Button variant="ghost" className="skip-centered" onClick={onSkip}>
        {ru.skip}
      </Button>
    </div>
  )
}
export function SwipeCards({ question, onSubmit, onSkip, onProgress }: InteractionProps) {
  const [index, setIndex] = useState(0),
    [answers, setAnswers] = useState<string[]>([])
  const current = question.options[index],
    Icon = assets[current.assetId]
  function react(interested: boolean) {
    const next = [...answers, `${interested ? 'Интересно' : 'Не интересно'}: ${current.label}`]
    if (index === question.options.length - 1) onSubmit(next.join('; '))
    else {
      setAnswers(next)
      setIndex(index + 1)
      onProgress?.()
    }
  }
  return (
    <div className="swipe-interaction">
      <motion.div
        key={current.id}
        className="swipe-card"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.5}
        onDragEnd={(_, info) => {
          if (Math.abs(info.offset.x) > 90) react(info.offset.x > 0)
        }}
      >
        <span className="asset-orbit">
          <Icon size={54} strokeWidth={1.1} />
        </span>
        <strong>{current.label}</strong>
        <p>{current.description || 'Есть место для этого в вашей жизни?'}</p>
      </motion.div>
      <p className="helper">
        {index + 1} из {question.options.length}
      </p>
      <div className="swipe-actions">
        <Button variant="outline" onClick={() => react(false)}>
          <ThumbsDown size={18} />
          Пока нет
        </Button>
        <Button onClick={() => react(true)}>
          <ThumbsUp size={18} />
          Интересно
        </Button>
      </div>
      <Button variant="ghost" onClick={onSkip}>
        {ru.skip}
      </Button>
    </div>
  )
}
export function AppRecognition({ question, onSubmit, onSkip }: InteractionProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  return (
    <div>
      <div className="recognition-list">
        {question.options.map((o) => {
          const Icon = assets[o.assetId]
          return (
            <div className="recognition-row" key={o.id}>
              <div className="recognition-name">
                <span className="asset-tile">
                  <Icon size={22} />
                </span>
                <strong>{o.label}</strong>
              </div>
              <div role="group" aria-label={o.label} className="segmented">
                {['Не знаком', 'Знаю', 'Использую'].map((label) => (
                  <button
                    key={label}
                    aria-pressed={values[o.id] === label}
                    onClick={() => setValues((v) => ({ ...v, [o.id]: label }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <div className="question-actions">
        <Button
          disabled={Object.keys(values).length !== question.options.length}
          onClick={() =>
            onSubmit(question.options.map((o) => `${values[o.id]}: ${o.label}`).join('; '))
          }
        >
          {ru.continue}
          <ArrowRight size={17} />
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          {ru.skip}
        </Button>
      </div>
    </div>
  )
}
export function ScenarioGame({ question, onSubmit, onSkip }: InteractionProps) {
  return (
    <div>
      <div className="scenario-options" role="group" aria-label={question.title}>
        {question.options.map((o, i) => (
          <button className="scenario-option" key={o.id} onClick={() => onSubmit(o.label)}>
            <span>{String(i + 1).padStart(2, '0')}</span>
            <strong>{o.label}</strong>
            <ArrowRight size={18} />
          </button>
        ))}
      </div>
      <Button className="skip-centered" variant="ghost" onClick={onSkip}>
        {ru.skip}
      </Button>
    </div>
  )
}
const interactionComponents = {
  VoiceTextQuestion,
  ChoiceCards,
  ThisOrThat,
  SwipeCards,
  AppRecognition,
  ScenarioGame,
}
export function InteractionRenderer(props: InteractionProps) {
  const Component = interactionComponents[props.question.component]
  return <Component {...props} />
}
