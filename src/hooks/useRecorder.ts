import { useEffect, useRef, useState } from 'react'
import { ru } from '../lib/i18n'
const MAX_AUDIO = 4 * 1024 * 1024
export function useRecorder(onTranscript: (text: string) => void, enabled: boolean) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'recording' | 'transcribing'>('idle')
  const [seconds, setSeconds] = useState(0),
    [error, setError] = useState('')
  const generation = useRef(0)
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    chunks = useRef<Blob[]>([]),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    cancelled = useRef(false),
    abort = useRef<AbortController | null>(null),
    alive = useRef(true)
  function cleanup() {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }
  function cancel() {
    generation.current++
    cancelled.current = true
    abort.current?.abort()
    if (recorder.current?.state === 'recording') recorder.current.stop()
    cleanup()
    chunks.current = []
    if (alive.current) setStatus('idle')
  }
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      cancelled.current = true
      abort.current?.abort()
      if (recorder.current?.state === 'recording') recorder.current.stop()
      stream.current?.getTracks().forEach((t) => t.stop())
      if (timer.current) clearInterval(timer.current)
    }
  }, [])
  async function start() {
    const recordingId = ++generation.current
    setError('')
    cancelled.current = false
    if (!enabled) {
      setError(
        'В демо голос не отправляется. Для распознавания включите AI-режим. Текстовый ответ доступен всегда.',
      )
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Браузер не поддерживает запись. Напишите ответ текстом.')
      return
    }
    setStatus('requesting')
    try {
      const incoming = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!alive.current || cancelled.current || recordingId !== generation.current) {
        incoming.getTracks().forEach((t) => t.stop())
        return
      }
      stream.current = incoming
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      )
      if (!mimeType) throw new Error('format')
      const rec = new MediaRecorder(incoming, { mimeType })
      recorder.current = rec
      chunks.current = []
      let size = 0
      rec.ondataavailable = (event) => {
        size += event.data.size
        if (size > MAX_AUDIO) {
          cancel()
          setError('Запись слишком большая. Попробуйте короче.')
          return
        }
        if (event.data.size) chunks.current.push(event.data)
      }
      rec.onstop = async () => {
        if (recordingId !== generation.current) {
          incoming.getTracks().forEach((t) => t.stop())
          return
        }
        cleanup()
        if (cancelled.current || !alive.current) return
        const blob = new Blob(chunks.current, { type: mimeType })
        chunks.current = []
        if (!blob.size || blob.size > MAX_AUDIO) {
          setStatus('idle')
          setError('Запись пустая или слишком большая.')
          return
        }
        setStatus('transcribing')
        const controller = new AbortController()
        abort.current = controller
        const timeout = setTimeout(() => controller.abort(), 30000)
        try {
          const form = new FormData()
          form.append(
            'file',
            blob,
            mimeType.includes('mp4')
              ? 'recording.mp4'
              : mimeType.includes('ogg')
                ? 'recording.ogg'
                : 'recording.webm',
          )
          const r = await fetch('/api/transcribe', {
            method: 'POST',
            body: form,
            signal: controller.signal,
          })
          if (!r.ok) throw new Error()
          const data = (await r.json()) as { text: string }
          if (alive.current && !cancelled.current && recordingId === generation.current)
            onTranscript(data.text)
        } catch {
          if (alive.current && !cancelled.current && recordingId === generation.current)
            setError(ru.transcriptionError)
        } finally {
          clearTimeout(timeout)
          if (alive.current && !cancelled.current && recordingId === generation.current)
            setStatus('idle')
        }
      }
      rec.start(250)
      setStatus('recording')
      setSeconds(0)
      let elapsed = 0
      timer.current = setInterval(() => {
        elapsed++
        setSeconds(elapsed)
        if (elapsed >= 45 && rec.state === 'recording') rec.stop()
      }, 1000)
    } catch {
      if (recordingId !== generation.current) return
      cleanup()
      if (alive.current) {
        setStatus('idle')
        setError(ru.voiceError)
      }
    }
  }
  return {
    status,
    seconds,
    error,
    start,
    cancel,
    stop: () => {
      if (recorder.current?.state === 'recording') recorder.current.stop()
    },
  }
}
