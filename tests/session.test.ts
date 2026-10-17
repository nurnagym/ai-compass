import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearSession,
  readSession,
  saveSession,
  SESSION_KEY,
} from '../src/features/onboarding/storage'
import { initialSession, sessionReducer } from '../src/features/onboarding/machine'
import { demoNext, introduction } from '../src/features/onboarding/director'
import type { Interaction } from '../src/types/session'
afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})
const answer: Interaction = {
  id: 'step-1',
  question: introduction,
  answer: 'Ищу работу',
  skipped: false,
}
describe('bounded current-tab session restoration', () => {
  it('restores an intro draft and preferences without an AI request', () => {
    const session = sessionReducer(initialSession(), { type: 'START' })
    saveSession({ session, mode: 'live', timerEnabled: false, draft: 'Мой черновик' })
    expect(readSession()).toMatchObject({
      mode: 'live',
      timerEnabled: false,
      draft: 'Мой черновик',
      session: { phase: 'INTRODUCTION', history: [] },
    })
  })
  it('restores the question and recomputes evidence instead of trusting cached scores', () => {
    let session = sessionReducer(initialSession(), { type: 'START' })
    session = sessionReducer(session, { type: 'SUBMIT', interaction: answer })
    session = sessionReducer(session, { type: 'RESOLVE', result: demoNext([answer]) })
    saveSession({ session, mode: 'demo', timerEnabled: true, draft: '' })
    expect(readSession()?.session).toMatchObject({
      phase: 'DISCOVERY',
      question: session.question,
      history: [answer],
    })
    expect(readSession()?.session.result?.focus.coverage?.independentAreas).toBe(1)
  })
  it('restores an interrupted request as a recoverable error instead of automatically retrying', () => {
    let session = sessionReducer(initialSession(), { type: 'START' })
    session = sessionReducer(session, { type: 'SUBMIT', interaction: answer })
    saveSession({ session, mode: 'live', timerEnabled: true, draft: '' })
    expect(readSession()?.session.phase).toBe('ERROR')
    expect(readSession()?.session.history).toEqual([answer])
  })
  it.each(['broken json', 'x'.repeat(64001), JSON.stringify({ version: 99 })])(
    'discards malformed, oversized and unsupported snapshots',
    (text) => {
      sessionStorage.setItem(SESSION_KEY, text)
      expect(readSession()).toBeNull()
      expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
    },
  )
  it('clears only this app snapshot on restart', () => {
    sessionStorage.setItem('unrelated', 'preserve')
    saveSession({
      session: sessionReducer(initialSession(), { type: 'START' }),
      mode: 'demo',
      timerEnabled: true,
      draft: 'Текст',
    })
    clearSession()
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
    expect(sessionStorage.getItem('unrelated')).toBe('preserve')
  })
  it('still works in memory when the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    expect(() =>
      saveSession({
        session: sessionReducer(initialSession(), { type: 'START' }),
        mode: 'demo',
        timerEnabled: true,
        draft: '',
      }),
    ).not.toThrow()
  })
})
