import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  ChoiceCards,
  ThisOrThat,
  VoiceTextQuestion,
  AppRecognition,
  SwipeCards,
  ScenarioGame,
} from '../src/components/onboarding/Interactions'
import { RecommendationCard } from '../src/components/recommendations/RecommendationCard'
import { introduction } from '../src/features/onboarding/director'
import type { Question } from '../src/types/session'
const question: Question = {
  ...introduction,
  component: 'ChoiceCards',
  title: 'Что ближе?',
  options: [
    { id: 'a', label: 'Исследовать документы', description: 'Источники', assetId: 'research' },
    { id: 'b', label: 'Создавать фотографии', description: 'Творчество', assetId: 'creativity' },
  ],
}
describe('fixed component library', () => {
  it('ChoiceCards requires selection and emits allowlisted labels', async () => {
    const user = userEvent.setup(),
      submit = vi.fn()
    render(
      <ChoiceCards
        question={{ ...question, multiple: true }}
        onSubmit={submit}
        onSkip={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Исследовать документы/ }))
    expect(screen.getByRole('button', { name: /Исследовать документы/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))
    expect(submit).toHaveBeenCalledWith('Исследовать документы')
  })
  it('single ChoiceCards submits immediately without a Continue step', async () => {
    const submit = vi.fn()
    render(<ChoiceCards question={question} onSubmit={submit} onSkip={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Продолжить' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Исследовать документы/ }))
    expect(submit).toHaveBeenCalledExactlyOnceWith('Исследовать документы')
  })
  it('ThisOrThat submits a single tap', async () => {
    const submit = vi.fn()
    render(
      <ThisOrThat
        question={{ ...question, component: 'ThisOrThat' }}
        onSubmit={submit}
        onSkip={() => {}}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Создавать фотографии/ }))
    expect(submit).toHaveBeenCalledWith('Создавать фотографии')
  })
  it('VoiceTextQuestion validates empty text and keeps editable text input', async () => {
    const submit = vi.fn()
    render(<VoiceTextQuestion question={introduction} onSubmit={submit} onSkip={() => {}} />)
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Моя задача' } })
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    expect(submit).toHaveBeenCalledWith('Моя задача')
  })
  it('makes only the introduction required and allows skipping later open questions', () => {
    const props = { onSubmit: () => {}, onSkip: () => {} }
    const view = render(<VoiceTextQuestion question={introduction} {...props} />)
    expect(screen.getByRole('textbox')).toBeRequired()
    expect(screen.queryByRole('button', { name: 'Пропустить' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled()
    view.rerender(<VoiceTextQuestion question={{ ...introduction, id: 'follow-up' }} {...props} />)
    expect(screen.getByRole('textbox')).not.toBeRequired()
    expect(screen.getByRole('button', { name: 'Пропустить' })).toBeEnabled()
  })
  it('handles microphone denial without disabling text', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
      },
    })
    vi.stubGlobal('MediaRecorder', class {})
    render(<VoiceTextQuestion question={introduction} onSubmit={() => {}} onSkip={() => {}} live />)
    await userEvent.click(screen.getByRole('button', { name: 'Записать голосом' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось использовать микрофон')
    expect(screen.getByRole('textbox')).toBeEnabled()
    vi.unstubAllGlobals()
  })
  it('demo voice is explicitly unavailable and does not call APIs', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    render(<VoiceTextQuestion question={introduction} onSubmit={() => {}} onSkip={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Записать голосом' }))
    expect(screen.getByRole('alert')).toHaveTextContent('В демо голос не отправляется')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('AppRecognition records all three familiarity states', async () => {
    const submit = vi.fn()
    render(<AppRecognition question={question} onSubmit={submit} onSkip={() => {}} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Использую' })[0])
    await userEvent.click(screen.getAllByRole('button', { name: 'Не знаком' })[1])
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    expect(submit).toHaveBeenCalledWith(
      'Использую: Исследовать документы; Не знаком: Создавать фотографии',
    )
  })
  it('SwipeCards has tap alternatives and submits negative as well as positive reactions', async () => {
    const submit = vi.fn()
    render(<SwipeCards question={question} onSubmit={submit} onSkip={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Интересно' }))
    await userEvent.click(screen.getByRole('button', { name: 'Пока нет' }))
    expect(submit).toHaveBeenCalledWith(
      'Интересно: Исследовать документы; Не интересно: Создавать фотографии',
    )
  })
  it('ScenarioGame has keyboard-operable answer buttons', async () => {
    const submit = vi.fn()
    render(<ScenarioGame question={question} onSubmit={submit} onSkip={() => {}} />)
    const button = screen.getByRole('button', { name: /Исследовать документы/ })
    button.focus()
    await userEvent.keyboard('{Enter}')
    expect(submit).toHaveBeenCalledWith('Исследовать документы')
  })
  it('previews a transcript before submission, permits editing, and releases microphone tracks', async () => {
    const stop = vi.fn(),
      submit = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
    })
    class Recorder {
      static isTypeSupported() {
        return true
      }
      state = 'inactive'
      ondataavailable: ((e: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      start() {
        this.state = 'recording'
      }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['fixture'], { type: 'audio/webm' }) })
        this.onstop?.()
      }
    }
    vi.stubGlobal('MediaRecorder', Recorder)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ text: 'Распознанный текст' }))
    const view = render(
      <VoiceTextQuestion question={introduction} onSubmit={submit} onSkip={() => {}} live />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Записать голосом' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Остановить запись' }))
    expect(await screen.findByText(/Текст распознан/)).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('Распознанный текст')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Исправленный текст' } })
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    expect(submit).toHaveBeenCalledWith('Исправленный текст')
    expect(stop).toHaveBeenCalled()
    view.unmount()
    vi.unstubAllGlobals()
  })
  it('RecommendationCard uses catalog URL and session-only feedback', async () => {
    render(
      <RecommendationCard
        recommendation={{
          toolId: 'upscayl',
          score: 90,
          exploratory: false,
          opportunity: 'Фотографии',
          why: 'Вы обрабатываете фотографии',
          firstAction: 'Попробуйте тестовое изображение',
          sourceIds: ['a'],
          evidenceQuotes: ['фотографии'],
        }}
      />,
    )
    expect(screen.getByRole('link', { name: /Попробовать инструмент/ })).toHaveAttribute(
      'href',
      'https://upscayl.org',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Полезно' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('только в этой вкладке'),
    )
  })
})
