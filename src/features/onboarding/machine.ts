import { introduction } from './director'
import { MAX_STEPS, type DirectorResult, type Interaction, type Session } from '../../types/session'
export const initialSession = (): Session => ({
  phase: 'WELCOME',
  history: [],
  question: introduction,
  result: null,
  error: null,
})
export type SessionEvent =
  | { type: 'START' | 'RESTART' | 'BACK' | 'RETRY' }
  | { type: 'SUBMIT'; interaction: Interaction }
  | { type: 'RESOLVE'; result: DirectorResult }
  | { type: 'FAIL'; message: string }
export function sessionReducer(state: Session, event: SessionEvent): Session {
  switch (event.type) {
    case 'RESTART':
      return initialSession()
    case 'START':
      return state.phase === 'WELCOME' ? { ...state, phase: 'INTRODUCTION' } : state
    case 'SUBMIT':
      if (
        !['INTRODUCTION', 'DISCOVERY'].includes(state.phase) ||
        state.history.length >= MAX_STEPS ||
        (state.history.length === 0 && event.interaction.skipped) ||
        (!event.interaction.skipped && !event.interaction.answer.trim())
      )
        return state
      return {
        ...state,
        phase: 'EVALUATING',
        history: [...state.history, event.interaction],
        error: null,
      }
    case 'RESOLVE':
      if (state.phase !== 'EVALUATING') return state
      return {
        ...state,
        phase: event.result.question
          ? state.history.length < 1
            ? 'INTRODUCTION'
            : 'DISCOVERY'
          : 'RESULTS',
        question: event.result.question ?? state.question,
        result: event.result,
        error: null,
      }
    case 'FAIL':
      return state.phase === 'EVALUATING'
        ? { ...state, phase: 'ERROR', error: event.message }
        : state
    case 'RETRY':
      return state.phase === 'ERROR' ? { ...state, phase: 'EVALUATING', error: null } : state
    case 'BACK': {
      if (state.phase === 'EVALUATING') return state
      const last = state.history.at(-1)
      return last
        ? {
            ...state,
            phase: state.history.length <= 1 ? 'INTRODUCTION' : 'DISCOVERY',
            history: state.history.slice(0, -1),
            question: last.question,
            result: null,
            error: null,
          }
        : { ...state, phase: 'WELCOME' }
    }
  }
}
