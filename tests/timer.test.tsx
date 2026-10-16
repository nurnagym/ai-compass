import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionExperience } from '../src/components/onboarding/QuestionExperience'
import { introduction } from '../src/features/onboarding/director'
import type { Question } from '../src/types/session'
const tick = (seconds: number) => act(() => vi.advanceTimersByTime(seconds * 1000))
function Experience({
  question = introduction,
  paused = false,
  live = false,
  onSubmit = () => {},
  onSkip = () => {},
}: {
  question?: Question
  paused?: boolean
  live?: boolean
  onSubmit?: (answer: string) => void
  onSkip?: () => void
}) {
  const [enabled, setEnabled] = useState(true)
  return (
    <QuestionExperience
      key={question.id}
      question={question}
      paused={paused}
      timerEnabled={enabled}
      onTimerEnabledChange={setEnabled}
      live={live}
      onSubmit={onSubmit}
      onSkip={onSkip}
    />
  )
}
beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'visibilityState')
})
describe('answer timebox', () => {
  it('counts active seconds and allows extending before or after expiry', () => {
    render(<Experience />)
    expect(screen.getByRole('timer')).toHaveTextContent('00:20')
    tick(5)
    expect(screen.getByRole('timer')).toHaveTextContent('00:15')
    fireEvent.click(screen.getByRole('button', { name: 'Добавить 20 секунд' }))
    expect(screen.getByRole('timer')).toHaveTextContent('00:35')
    tick(35)
    expect(screen.getByRole('status')).toHaveTextContent('Время вышло')
    fireEvent.click(screen.getByRole('button', { name: 'Добавить 20 секунд' }))
    expect(screen.getByRole('timer')).toHaveTextContent('00:20')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('keeps drafts on expiry without submitting or skipping for the user', () => {
    const submit = vi.fn(),
      skip = vi.fn()
    render(<Experience onSubmit={submit} onSkip={skip} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ответить своими словами' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Моя конкретная задача' } })
    tick(21)
    expect(screen.getByRole('status')).toHaveTextContent('Время вышло')
    expect(screen.getByRole('textbox')).toHaveValue('Моя конкретная задача')
    expect(submit).not.toHaveBeenCalled()
    expect(skip).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    expect(submit).toHaveBeenCalledWith('Моя конкретная задача')
  })
  it('disables time limits for the session and resets on re-enabling', () => {
    render(<Experience />)
    tick(5)
    fireEvent.click(screen.getByRole('button', { name: 'Без таймера' }))
    tick(300)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByText('В своём темпе')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Включить таймер' }))
    expect(screen.getByRole('timer')).toHaveTextContent('00:20')
  })
  it('pauses for hidden tabs and privacy dialogs, then resumes without a time jump', () => {
    const view = render(<Experience />)
    tick(3)
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    tick(60)
    expect(screen.getByRole('timer')).toHaveTextContent('00:17')
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    tick(1)
    expect(screen.getByRole('timer')).toHaveTextContent('00:16')
    view.rerender(<Experience paused />)
    tick(30)
    expect(screen.getByRole('timer')).toHaveTextContent('00:16')
    view.rerender(<Experience />)
    tick(1)
    expect(screen.getByRole('timer')).toHaveTextContent('00:15')
  })
  it('resets the budget per question and per swipe card', () => {
    const view = render(<Experience />)
    tick(6)
    const swipe: Question = {
      ...introduction,
      id: 'swipe',
      component: 'SwipeCards',
      options: introduction.options.slice(0, 2),
    }
    view.rerender(<Experience question={swipe} />)
    expect(screen.getByRole('timer')).toHaveTextContent('00:20')
    tick(5)
    fireEvent.click(screen.getByRole('button', { name: 'Интересно', exact: true }))
    expect(screen.getByRole('timer')).toHaveTextContent('00:20')
  })
  it('retains a written draft when switching back to choices', () => {
    render(<Experience />)
    fireEvent.click(screen.getByRole('button', { name: 'Ответить своими словами' }))
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Нужна помощь с исследованиями' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Вернуться к вариантам' }))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ответить своими словами' }))
    expect(screen.getByRole('textbox')).toHaveValue('Нужна помощь с исследованиями')
  })
  it('pauses while recording and resumes after cancellation', async () => {
    const stop = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
    })
    class Recorder {
      static isTypeSupported() {
        return true
      }
      state = 'inactive'
      onstop: (() => void) | null = null
      start() {
        this.state = 'recording'
      }
      stop() {
        this.state = 'inactive'
        this.onstop?.()
      }
    }
    vi.stubGlobal('MediaRecorder', Recorder)
    render(<Experience live />)
    fireEvent.click(screen.getByRole('button', { name: 'Ответить своими словами' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Записать голосом' }))
    })
    expect(screen.getByText('Таймер на паузе')).toBeInTheDocument()
    tick(10)
    expect(screen.getByRole('timer')).toHaveTextContent('00:20')
    fireEvent.click(screen.getByRole('button', { name: 'Отменить запись' }))
    expect(stop).toHaveBeenCalled()
    tick(1)
    expect(screen.getByRole('timer')).toHaveTextContent('00:19')
  })
})
