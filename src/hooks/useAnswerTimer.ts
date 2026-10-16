import { useEffect, useState } from 'react'
export const ANSWER_SECONDS = 20
// Count active answer time only. Hidden tabs, recording and privacy dialogs must not use the budget.
export function useAnswerTimer(enabled: boolean, paused: boolean) {
  const [remaining, setRemaining] = useState(ANSWER_SECONDS)
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden')
  useEffect(() => {
    const update = () => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  const expired = remaining === 0
  const stopped = paused || hidden
  useEffect(() => {
    if (!enabled || stopped || expired) return
    const interval = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(interval)
  }, [enabled, stopped, expired])
  return {
    remaining,
    expired,
    paused: stopped,
    extend: () => setRemaining((value) => value + ANSWER_SECONDS),
    reset: () => setRemaining(ANSWER_SECONDS),
  }
}
