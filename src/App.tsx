import { useEffect, useReducer, useRef, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import {
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  Compass,
  Sparkles,
  ShieldCheck,
  RotateCcw,
  Check,
  X,
} from 'lucide-react'
import { Button } from './components/ui/button'
import { QuestionExperience } from './components/onboarding/QuestionExperience'
import { Gallery } from './components/onboarding/Gallery'
import { RecommendationCard } from './components/recommendations/RecommendationCard'
import { assets } from './data/assets'
import { initialSession, sessionReducer } from './features/onboarding/machine'
import { ru } from './lib/i18n'
import { apiErrorMessage } from './lib/apiErrors'
import { clearSession, readSession, saveSession } from './features/onboarding/storage'
import type { DirectorResult } from './types/session'
export default function App() {
  const [bootstrap] = useState(readSession)
  const [restoredAnswer, setRestoredAnswer] = useState(bootstrap?.draft ?? '')
  const [session, dispatch] = useReducer(sessionReducer, bootstrap?.session ?? initialSession()),
    [mode, setMode] = useState<'demo' | 'live'>(bootstrap?.mode ?? 'demo'),
    [liveAvailable, setLiveAvailable] = useState(false),
    [gallery, setGallery] = useState(import.meta.env.DEV && location.hash === '#gallery'),
    [privacy, setPrivacy] = useState(false),
    [timerEnabled, setTimerEnabled] = useState(bootstrap?.timerEnabled ?? true)
  const requestId = useRef(0),
    busy = useRef(false),
    controller = useRef<AbortController | null>(null),
    heading = useRef<HTMLDivElement>(null)
  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((d: { aiEnabled: boolean }) => setLiveAvailable(d.aiEnabled))
      .catch(() => {})
    return () => {
      controller.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (session.phase !== 'WELCOME' && session.phase !== 'EVALUATING') heading.current?.focus()
  }, [session.phase, session.question.id])
  useEffect(() => {
    saveSession({ session, mode, timerEnabled, draft: restoredAnswer })
  }, [session, mode, timerEnabled, restoredAnswer])
  useEffect(() => {
    function cancelRequest() {
      requestId.current++
      controller.current?.abort()
      busy.current = false
      dispatch({
        type: 'FAIL',
        message: 'Запрос был прерван. Можно повторить его или вернуться к ответу.',
      })
    }
    window.addEventListener('pagehide', cancelRequest)
    return () => window.removeEventListener('pagehide', cancelRequest)
  }, [])
  function restart() {
    clearSession()
    requestId.current++
    controller.current?.abort()
    busy.current = false
    setTimerEnabled(true)
    setRestoredAnswer('')
    dispatch({ type: 'RESTART' })
  }
  async function evaluate(history = session.history) {
    if (busy.current) return
    busy.current = true
    const id = ++requestId.current,
      abort = new AbortController()
    controller.current = abort
    const timeout = setTimeout(() => abort.abort(), 120000)
    try {
      const response = await fetch('/api/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: {
            version: 1,
            mode,
            history: history.slice(0, -1),
            signals: session.result
              ? [
                  ...session.result.memory.confirmedFacts,
                  ...session.result.memory.goals,
                  ...session.result.memory.interests,
                  ...session.result.memory.toolsUsed,
                  ...session.result.memory.hypotheses,
                ].slice(0, 28)
              : [],
          },
          answer: history.at(-1),
        }),
        signal: abort.signal,
      })
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null)
        const code =
          failure && typeof failure === 'object' && 'errorCode' in failure
            ? failure.errorCode
            : undefined
        throw new Error(apiErrorMessage(code, response.status))
      }
      const payload = (await response.json()) as { session?: { result?: DirectorResult } }
      const result = payload.session?.result
      if (
        !result?.focus ||
        !Array.isArray(result.recommendations) ||
        (!result.question && result.action !== 'RECOMMEND')
      )
        throw new Error('Не удалось прочитать ответ. Попробуйте ещё раз.')
      if (requestId.current === id) dispatch({ type: 'RESOLVE', result })
    } catch (e) {
      if (requestId.current === id)
        dispatch({
          type: 'FAIL',
          message:
            e instanceof Error && e.name !== 'AbortError'
              ? e.message
              : 'Ответ занял слишком много времени. Попробуйте ещё раз.',
        })
    } finally {
      clearTimeout(timeout)
      if (requestId.current === id) busy.current = false
    }
  }
  function submit(answer: string, skipped = false) {
    if (
      busy.current ||
      session.phase === 'EVALUATING' ||
      (session.question.id === 'intro' && skipped)
    )
      return
    const interaction = {
      id: `step-${session.history.length + 1}`,
      question: session.question,
      answer: answer.trim(),
      skipped,
    }
    if (!skipped && !interaction.answer) return
    setRestoredAnswer('')
    dispatch({ type: 'SUBMIT', interaction })
    void evaluate([...session.history, interaction])
  }
  function back() {
    setRestoredAnswer(session.history.at(-1)?.answer ?? '')
    dispatch({ type: 'BACK' })
  }
  const welcome = session.phase === 'WELCOME',
    results = session.phase === 'RESULTS',
    active = !welcome && !results
  const phaseLabels = ['Знакомство', 'Что вам близко', 'Ваши открытия']
  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <header className="site-header shell">
          <button className="wordmark" onClick={restart} aria-label="AI Compass — на главную">
            <span className="brand-icon">
              <Compass size={23} strokeWidth={1.7} />
            </span>
            <span>
              ai compass<span className="brand-dot">.</span>
            </span>
          </button>
          <div className="header-actions">
            <span className="mode-badge">
              <span />
              {mode === 'demo' ? 'Демо · симуляция' : 'AI-режим'}
            </span>
            <button className="privacy-link" onClick={() => setPrivacy(true)}>
              <ShieldCheck size={15} />
              <span>Только эта сессия</span>
            </button>
          </div>
        </header>
        {gallery && import.meta.env.DEV ? (
          <Gallery onClose={() => setGallery(false)} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.main
              key={welcome ? 'welcome' : results ? 'results' : 'journey'}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className={`shell ${welcome ? 'welcome' : results ? 'results' : 'journey'}`}
            >
              {welcome ? (
                <>
                  <div className="welcome-layout">
                    <section className="welcome-copy">
                      <div className="eyebrow">
                        <span className="tiny-star">✦</span> МЕНЬШЕ ПОИСКА. БОЛЬШЕ ВОЗМОЖНОСТЕЙ.
                      </div>
                      <h1>
                        Откройте, что AI
                        <br />
                        может <span>для вас.</span>
                      </h1>
                      <p className="welcome-description">
                        Немного о вас и ваших интересах.
                        <br />
                        Инструменты, о которых вы могли не знать.
                        <br />
                        Возможности, которые захочется попробовать.
                      </p>
                      <div className="welcome-cta">
                        <Button onClick={() => dispatch({ type: 'START' })}>
                          Найти свои возможности
                          <ArrowRight size={18} />
                        </Button>
                        <span>1–2 минуты · без регистрации</span>
                      </div>
                      <div className="welcome-proof">
                        <span>
                          <Check size={15} />
                          Под ваши интересы
                        </span>
                        <span>
                          <Check size={15} />
                          Без сложных слов
                        </span>
                        <span>
                          <Check size={15} />
                          Без профиля
                        </span>
                      </div>
                    </section>
                    <DiscoveryIllustration />
                  </div>
                  <section className="how-section">
                    <div className="section-kicker">
                      <span>НЕМНОГО О ВАС. МНОГО НОВОГО ДЛЯ ВАС.</span>
                      <span className="section-line" />
                    </div>
                    <div className="how-grid">
                      {[
                        {
                          n: '01',
                          title: 'Расскажите о себе',
                          text: 'Не анкета. Короткое знакомство с тем, что важно именно вам.',
                        },
                        {
                          n: '02',
                          title: 'Следуйте любопытству',
                          text: 'Пара простых выборов помогает заметить новые возможности.',
                        },
                        {
                          n: '03',
                          title: 'Найдите своё',
                          text: 'Полезные инструменты, понятные объяснения и первый шаг.',
                        },
                      ].map((item) => (
                        <div className="how-item" key={item.n}>
                          <span>{item.n}</span>
                          <div>
                            <h2>{item.title}</h2>
                            <p>{item.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="demo-notice">
                    <Sparkles size={17} />
                    <p>
                      {mode === 'demo'
                        ? 'Сейчас вы в демо: вопросы подбираются симуляцией, ответы не отправляются AI-провайдеру.'
                        : 'В AI-режиме ответы обрабатывает OpenAI. Не отправляйте личные или конфиденциальные данные.'}
                    </p>
                    {liveAvailable && (
                      <button onClick={() => setMode(mode === 'demo' ? 'live' : 'demo')}>
                        {mode === 'demo' ? 'Включить AI' : 'Перейти в демо'}
                        <ArrowUpRight size={14} />
                      </button>
                    )}
                  </div>
                </>
              ) : results ? (
                <>
                  <div className="results-intro" ref={heading} tabIndex={-1}>
                    <span className="eyebrow">
                      <Sparkles size={15} /> ВОЗМОЖНОСТИ СТАЛИ БЛИЖЕ
                    </span>
                    <h1>
                      Ваши AI-открытия<span>.</span>
                    </h1>
                    <p>
                      {session.result?.recommendations.length
                        ? 'Несколько идей, с которых можно начать. Выберите то, что откликается.'
                        : 'Пока мало информации для полезного совпадения. Можно начать заново и рассказать о своих занятиях и интересах.'}
                    </p>
                  </div>
                  <div className="results-grid">
                    {session.result?.recommendations.map((r, i) => (
                      <motion.div
                        key={r.opportunityId ?? r.toolId}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                      >
                        <RecommendationCard recommendation={r} index={i} />
                      </motion.div>
                    ))}
                  </div>
                  <div className="results-footer">
                    <p>
                      {session.result?.recommendations.some((r) => r.exploratory)
                        ? '«Идея для пробы» означает, что информации пока мало. Это возможность для исследования, а не уверенный вывод.'
                        : 'Рекомендации опираются на ваши ответы. Возможности и условия продуктов могут меняться.'}
                    </p>
                    <Button variant="outline" onClick={restart}>
                      <RotateCcw size={16} />
                      {ru.restart}
                    </Button>
                    <Button variant="ghost" onClick={back}>
                      <ArrowLeft size={16} />
                      Изменить последний ответ
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="journey-navigation">
                    <Button
                      variant="ghost"
                      onClick={back}
                      disabled={session.phase === 'EVALUATING'}
                    >
                      <ArrowLeft size={16} />
                      {ru.back}
                    </Button>
                    <div className="journey-stages">
                      {phaseLabels.map((label, i) => (
                        <span
                          key={label}
                          className={(session.history.length < 1 ? 0 : 1) === i ? 'current' : ''}
                        >
                          <i>{i + 1}</i>
                          <span>{label}</span>
                        </span>
                      ))}
                    </div>
                    <Button size="icon" variant="ghost" aria-label={ru.restart} onClick={restart}>
                      <RotateCcw size={17} />
                    </Button>
                  </div>
                  <div
                    className="journey-progress"
                    role="progressbar"
                    aria-label="Шаг знакомства"
                    aria-valuemin={0}
                    aria-valuemax={7}
                    aria-valuenow={session.history.length}
                  >
                    <motion.span
                      animate={{ width: `${Math.max(6, (session.history.length / 7) * 100)}%` }}
                    />
                  </div>
                  <section className="question-panel">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={
                          session.phase === 'EVALUATING'
                            ? 'loading'
                            : session.phase === 'ERROR'
                              ? 'error'
                              : session.question.id
                        }
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22 }}
                      >
                        {session.phase === 'EVALUATING' ? (
                          <div className="loading-state" role="status">
                            <span className="loading-orbit">
                              <Compass size={40} />
                            </span>
                            <h1>{ru.loading}</h1>
                            <p>
                              {mode === 'live'
                                ? 'Подбираем инструменты для ваших занятий и проверяем их сайты.'
                                : 'Собираем ответы в полезные идеи.'}
                            </p>
                          </div>
                        ) : session.phase === 'ERROR' ? (
                          <div className="error-state" role="alert">
                            <span className="eyebrow">ПАУЗА, А НЕ КОНЕЦ</span>
                            <h1>Не получилось продолжить.</h1>
                            <p>{session.error}</p>
                            <Button
                              onClick={() => {
                                dispatch({ type: 'RETRY' })
                                void evaluate()
                              }}
                            >
                              {ru.retry}
                              <ArrowRight size={16} />
                            </Button>
                            <Button variant="ghost" onClick={back}>
                              Вернуться к ответу
                            </Button>
                            {mode === 'live' && (
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  restart()
                                  setMode('demo')
                                }}
                              >
                                Начать демо без AI
                              </Button>
                            )}
                          </div>
                        ) : (
                          <>
                            <div
                              className="question-heading"
                              data-question-id={session.question.id}
                              ref={heading}
                              tabIndex={-1}
                            >
                              <span className="eyebrow">
                                {session.history.length < 1
                                  ? 'НАЧНЁМ СО ЗНАКОМСТВА'
                                  : 'ЧУТЬ БЛИЖЕ К ВАШИМ ОТКРЫТИЯМ'}{' '}
                                <span className="step-counter">
                                  {session.history.length + 1} / 7 макс.
                                </span>
                              </span>
                              <h1>{session.question.title}</h1>
                              <p className="question-description">{session.question.description}</p>
                            </div>
                            <QuestionExperience
                              key={session.question.id}
                              question={session.question}
                              initialAnswer={restoredAnswer}
                              onDraftChange={setRestoredAnswer}
                              live={mode === 'live'}
                              timerEnabled={timerEnabled}
                              onTimerEnabledChange={setTimerEnabled}
                              paused={privacy}
                              onSubmit={(answer) => submit(answer)}
                              onSkip={() => submit('', true)}
                            />
                            <p className="session-privacy">
                              <ShieldCheck size={14} />
                              {mode === 'demo'
                                ? 'Симуляция · без платных AI-вызовов'
                                : 'Ответы обрабатываются OpenAI · без постоянного профиля'}
                            </p>
                          </>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </section>
                </>
              )}
            </motion.main>
          </AnimatePresence>
        )}
        <footer className="site-footer shell">
          <span>Чуть больше возможностей каждый день.</span>
          <div>
            <button onClick={() => setPrivacy(true)}>О приватности</button>
            {import.meta.env.DEV && (
              <button
                onClick={() => {
                  if (!active) setGallery(!gallery)
                }}
                disabled={active}
              >
                Компоненты
              </button>
            )}
            <span>AI COMPASS © 2026</span>
          </div>
        </footer>
        {privacy && (
          <div className="modal-backdrop" onClick={() => setPrivacy(false)}>
            <PrivacyDialog onClose={() => setPrivacy(false)} mode={mode} />
          </div>
        )}
      </div>
    </MotionConfig>
  )
}
function PrivacyDialog({ onClose, mode }: { onClose: () => void; mode: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="privacy-modal"
      aria-labelledby="privacy-title"
      onCancel={onClose}
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        variant="ghost"
        size="icon"
        className="modal-close"
        aria-label="Закрыть"
        onClick={onClose}
      >
        <X size={18} />
      </Button>
      <ShieldCheck size={30} />
      <h2 id="privacy-title">Знакомство без профиля.</h2>
      <p>{ru.privacy}</p>
      <p>
        {mode === 'demo'
          ? 'Демо обрабатывает ответы симуляцией на сервере без AI-вызовов.'
          : 'В AI-режиме текст ответов и, по вашему выбору, аудио передаются OpenAI для обработки. Если в базе нет подходящего инструмента или ссылки на его сайт, OpenAI выполняет поиск в интернете по обобщённой задаче или названию продукта. У провайдера действуют собственные условия хранения данных.'}
      </p>
      <p>
        Мы не создаём аккаунт и не сохраняем ваши ответы в базе данных. Не сообщайте чувствительные
        данные. Прохождение временно сохраняется в этой вкладке, чтобы продолжить после обновления
        страницы. Кнопка «Начать заново» очищает его.
      </p>
      <Button onClick={onClose}>
        Понятно
        <Check size={16} />
      </Button>
    </dialog>
  )
}
function DiscoveryIllustration() {
  return (
    <div
      className="discovery-visual"
      aria-label="От ваших интересов к новым возможностям"
      role="img"
    >
      <div className="visual-caption">
        <span /> ВАШИ ИНТЕРЕСЫ. НОВЫЕ ГОРИЗОНТЫ.
      </div>
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="orbit-core">
        <div>
          <Compass size={58} strokeWidth={1} />
        </div>
        <span>
          Возможности
          <br />
          начинаются с вас
        </span>
      </div>
      <div className="floating-card float-research">
        <span className="asset-tile">
          <assets.research size={22} />
        </span>
        <div>
          <small>ПОНЯТЬ БОЛЬШЕ</small>
          <strong>От сложного — к ясному</strong>
          <span>Исследования и новые знания</span>
        </div>
        <ArrowUpRight size={15} />
      </div>
      <div className="floating-card float-creative">
        <span className="asset-tile">
          <assets.creativity size={22} />
        </span>
        <div>
          <small>СОЗДАВАТЬ СВОБОДНЕЕ</small>
          <strong>Больше места для идей</strong>
          <span>Тексты, фотографии и видео</span>
        </div>
        <ArrowUpRight size={15} />
      </div>
      <div className="floating-card float-time">
        <span className="asset-tile">
          <assets.productivity size={22} />
        </span>
        <div>
          <small>ОСВОБОДИТЬ ВРЕМЯ</small>
          <strong>Меньше рутины. Больше жизни.</strong>
          <span>Ваши занятия и увлечения</span>
        </div>
        <ArrowUpRight size={15} />
      </div>
      <span className="visual-spark spark-one">✦</span>
      <span className="visual-spark spark-two">✧</span>
      <div className="visual-bottom">
        <span className="mini-dot" />
        Маленькое открытие. Большая разница.
      </div>
    </div>
  )
}
