// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'
const mocks = vi.hoisted(() => ({ parse: vi.fn(), transcribe: vi.fn() }))
vi.mock('openai', () => ({
  default: class {
    responses = { parse: mocks.parse }
    audio = { transcriptions: { create: mocks.transcribe } }
  },
}))
import worker, { boundedBody, type Env } from '../worker/index'
import { introduction } from '../src/features/onboarding/director'
const env: Env = {
  AI_ENABLED: 'true',
  COMPASS_API_KEY: 'unit-test-not-a-real-key',
  AI_RATE_LIMITER: { limit: async () => ({ success: true }) },
}
const history = [
  { id: 'step-1', question: introduction, answer: 'Читаю документы', skipped: false },
]
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://compass.example/api/onboarding/next', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
beforeEach(() => {
  vi.clearAllMocks()
})
describe('Worker API contracts and cost guards', () => {
  it('reports demo availability without leaking key or configuration', async () => {
    const r = await worker.fetch(new Request('https://compass.example/api/status'), env)
    expect(await r.json()).toEqual({ aiEnabled: true, demo: true })
    expect(r.headers.get('Cache-Control')).toBe('no-store')
  })
  it('runs a full server demo without an API key', async () => {
    const r = await worker.fetch(req({ mode: 'demo', history }), {})
    expect(r.status).toBe(200)
    expect(((await r.json()) as { question: unknown }).question).toBeTruthy()
    expect(mocks.parse).not.toHaveBeenCalled()
  })
  it('refuses paid requests when kill switch is off', async () => {
    const r = await worker.fetch(req({ mode: 'live', history }), { ...env, AI_ENABLED: 'false' })
    expect(r.status).toBe(503)
    expect(mocks.parse).not.toHaveBeenCalled()
  })
  it('fails closed without the rate-limit binding', async () => {
    const r = await worker.fetch(req({ mode: 'live', history }), {
      ...env,
      AI_RATE_LIMITER: undefined,
    })
    expect(r.status).toBe(503)
  })
  it('applies shared IP rate limiting before calling provider', async () => {
    const limit = vi.fn().mockResolvedValue({ success: false })
    const r = await worker.fetch(
      req({ mode: 'live', history }, { 'CF-Connecting-IP': '192.0.2.1' }),
      { ...env, AI_RATE_LIMITER: { limit } },
    )
    expect(r.status).toBe(429)
    expect(r.headers.get('Retry-After')).toBe('60')
    expect(limit).toHaveBeenCalledWith({ key: '192.0.2.1' })
    expect(mocks.parse).not.toHaveBeenCalled()
  })
  it('rejects oversized requests even without Content-Length', async () => {
    const request = new Request('https://compass.example', {
      method: 'POST',
      body: 'x'.repeat(25000),
    })
    await expect(boundedBody(request, 24000)).rejects.toMatchObject({ status: 413 })
  })
  it('rejects malformed JSON, too many steps, duplicate IDs, wrong method and origin', async () => {
    expect(
      (
        await worker.fetch(
          new Request('https://compass.example/api/onboarding/next', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{',
          }),
          {},
        )
      ).status,
    ).toBe(400)
    expect(
      (await worker.fetch(req({ mode: 'live', history: Array(8).fill(history[0]) }), env)).status,
    ).toBe(400)
    expect(
      (await worker.fetch(req({ mode: 'demo', history: [...history, ...history] }), {})).status,
    ).toBe(400)
    expect(
      (await worker.fetch(new Request('https://compass.example/api/onboarding/next'), {})).status,
    ).toBe(405)
    expect(
      (await worker.fetch(req({ mode: 'live', history }, { Origin: 'https://evil.example' }), env))
        .status,
    ).toBe(403)
  })
  it('calls Responses structured parsing with bounded context and storage disabled', async () => {
    mocks.parse.mockResolvedValue({
      output_parsed: {
        action: 'ASK',
        claims: [
          {
            kind: 'fact',
            text: 'Читаю документы',
            quote: 'Читаю документы',
            sourceId: 'step-1',
            domain: 'research',
            negative: false,
            toolId: null,
          },
        ],
        question: { ...introduction, id: 'next', title: 'Какие документы сложнее всего читать?' },
      },
    })
    const r = await worker.fetch(req({ mode: 'live', history }), env)
    expect(r.status).toBe(200)
    const data = (await r.json()) as { mode: string; memory: { confirmedFacts: unknown[] } }
    expect(data.mode).toBe('live')
    expect(data.memory.confirmedFacts).toHaveLength(1)
    const call = mocks.parse.mock.calls[0][0]
    expect(call.store).toBe(false)
    expect(call.max_output_tokens).toBe(2200)
    expect(JSON.parse(call.input).candidateTools.length).toBeLessThanOrEqual(8)
    expect(call.text.format.type).toBe('json_schema')
  })
  it('rejects invalid model layouts and hides raw provider errors', async () => {
    mocks.parse.mockResolvedValue({
      output_parsed: {
        action: 'ASK',
        claims: [],
        question: { ...introduction, component: 'HTML' },
      },
    })
    expect((await worker.fetch(req({ mode: 'live', history }), env)).status).toBe(502)
    mocks.parse.mockRejectedValue(new Error('secret user answer'))
    const r = await worker.fetch(req({ mode: 'live', history }), env)
    expect(r.status).toBe(502)
    expect(await r.text()).not.toContain('secret user answer')
  })
  it('does not accept unsupported recording formats', async () => {
    const form = new FormData()
    form.append('file', new File(['audio'], 'evil.txt', { type: 'text/plain' }))
    const r = await worker.fetch(
      new Request('https://compass.example/api/transcribe', { method: 'POST', body: form }),
      env,
    )
    expect(r.status).toBe(415)
    expect(mocks.transcribe).not.toHaveBeenCalled()
  })
  it('transcribes supported audio server-side and caps editable output', async () => {
    mocks.transcribe.mockResolvedValue({ text: 'a'.repeat(2000) })
    const form = new FormData()
    form.append('file', new File(['fake fixture audio'], 'voice.webm', { type: 'audio/webm' }))
    const r = await worker.fetch(
      new Request('https://compass.example/api/transcribe', { method: 'POST', body: form }),
      env,
    )
    expect(r.status).toBe(200)
    expect(((await r.json()) as { text: string }).text.length).toBe(1800)
    expect(mocks.transcribe.mock.calls[0][0].model).toBe('gpt-4o-mini-transcribe')
  })
})
