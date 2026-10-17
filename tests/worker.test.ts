// @vitest-environment node
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
const mocks = vi.hoisted(() => ({ parse: vi.fn(), transcribe: vi.fn() }))
vi.mock('openai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('openai')>()),
  default: class {
    responses = { parse: mocks.parse }
    audio = { transcriptions: { create: mocks.transcribe } }
  },
}))
import { APIError, APIConnectionTimeoutError } from 'openai'
import worker, { boundedBody, type Env } from '../worker/index'
import { introduction } from '../src/features/onboarding/director'
import { sourceIds } from '../worker/sources'
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
const turnReq = (session: unknown, answer: unknown = history[0]) =>
  new Request('https://compass.example/api/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session, answer }),
  })
beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => vi.unstubAllGlobals())
describe('Worker API contracts and cost guards', () => {
  it('resolves a final live turn with catalog priority, grounded search and a limiter check per provider request', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(
          async (url: string) =>
            new Response(
              url.includes(sourceIds[2])
                ? 'Name,Website,Capabilities\nFixture Writer,https://writer.example,Writing and research'
                : 'Case,Solution\nWriting,Drafting',
            ),
        ),
    )
    const limit = vi.fn().mockResolvedValue({ success: true })
    mocks.parse.mockImplementation(
      async (request: { input: string; text: { format: { name: string } } }) => {
        const input = JSON.parse(request.input)
        if (request.text.format.name === 'onboarding_director')
          return { output_parsed: { signals: [], hypotheses: [], candidateQuestions: [] } }
        if (request.text.format.name === 'catalog_selection')
          return {
            output_parsed: {
              selections: input.targets
                .map((t: { index: number; opportunity: string }) => ({
                  ...t,
                  toolId: t.index === 0 ? null : input.tools[0].id,
                  reason: 'Помогает попробовать этот сценарий.',
                  workflow: ['Создайте пример.', 'Проверьте результат.'],
                  contextRowIds: [],
                }))
                .map(
                  (t: {
                    index: number
                    opportunity: string
                    toolId: string | null
                    reason: string
                    workflow: string[]
                    contextRowIds: string[]
                  }) => ({
                    index: t.index,
                    opportunity: t.opportunity,
                    toolId: t.toolId,
                    reason: t.reason,
                    workflow: t.workflow,
                    contextRowIds: t.contextRowIds,
                  }),
                ),
            },
          }
        return {
          status: 'completed',
          output_parsed: {
            tools: [
              {
                index: 0,
                name: 'Web Writer',
                officialUrl: 'https://found.example/',
                sourceUrl: 'https://found.example/features',
                description: 'Помощник',
                reason: 'Поддерживает нужный сценарий.',
                workflow: ['Создайте пример.', 'Проверьте результат.'],
                limitations: [],
              },
            ],
          },
          output: [
            {
              type: 'web_search_call',
              status: 'completed',
              action: {
                type: 'search',
                sources: [{ type: 'url', url: 'https://found.example/features' }],
              },
            },
          ],
        }
      },
    )
    const full = Array.from({ length: 7 }, (_, i) => ({
      ...history[0],
      id: `step-${i + 1}`,
      question: { ...introduction, id: i ? `q-${i}` : 'intro' },
      answer: i ? '' : 'Работаю с текстами',
      skipped: !!i,
    }))
    const r = await worker.fetch(
      turnReq({ version: 1, mode: 'live', history: full.slice(0, 6) }, full[6]),
      { ...env, AI_RATE_LIMITER: { limit }, SHEETS_ENABLED: 'true', TOOLS_GID: '125' },
    )
    expect(r.status).toBe(200)
    const data = (await r.json()) as {
      action: { type: string; recommendations: { tool: { source: string; officialUrl: string } }[] }
    }
    expect(data.action.type).toBe('results')
    expect(data.action.recommendations.map((r) => r.tool.source)).toEqual(['web', 'sheet'])
    expect(data.action.recommendations[0].tool.officialUrl).toBe('https://found.example/')
    expect(mocks.parse).toHaveBeenCalledTimes(3)
    expect(limit).toHaveBeenCalledTimes(3)
  })
  it('exposes source readiness and row counts without a paid model request', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(
          async (url: string) =>
            new Response(
              url.includes(sourceIds[2])
                ? 'Name,Website\nWriter,https://writer.example'
                : 'Case\nWriting',
            ),
        ),
    )
    const r = await worker.fetch(new Request('https://compass.example/api/sources'), {
      ...env,
      SHEETS_ENABLED: 'true',
      TOOLS_GID: '126',
    })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({
      enabled: true,
      ready: true,
      sources: [
        { role: 'use_cases', rows: 1 },
        { role: 'possible_solutions', rows: 1 },
        { role: 'tools', rows: 1 },
      ],
    })
    expect(mocks.parse).not.toHaveBeenCalled()
  })
  it('uses cases and solutions from configured sheets during live question generation', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(
        async (url: string) =>
          new Response(
            url.includes(sourceIds[2])
              ? 'Name,Website\nFixture Writer,https://writer.example'
              : 'Case,Solution\nУчебные материалы,Объяснение темы',
          ),
      )
    vi.stubGlobal('fetch', fetch)
    mocks.parse.mockResolvedValue({
      output_parsed: { signals: [], hypotheses: [], candidateQuestions: [] },
    })
    const r = await worker.fetch(req({ mode: 'live', history }), {
      ...env,
      SHEETS_ENABLED: 'true',
      TOOLS_GID: '123',
    })
    expect(r.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(3)
    const input = JSON.parse(mocks.parse.mock.calls[0][0].input)
    expect(input.knowledgeSources.map((s: { role: string }) => s.role)).toEqual([
      'use_cases',
      'possible_solutions',
    ])
    expect(input.knowledgeSources[0].rows[0].values.Case).toBe('Учебные материалы')
    expect(mocks.parse).toHaveBeenCalledTimes(1)
  })
  it('reports source access failure before starting a paid model call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('private sheet', { status: 403 })),
    )
    const r = await worker.fetch(req({ mode: 'live', history }), {
      ...env,
      SHEETS_ENABLED: 'true',
      TOOLS_GID: '124',
    })
    expect(r.status).toBe(503)
    expect(await r.json()).toMatchObject({ errorCode: 'DATA_SOURCES_UNAVAILABLE' })
    expect(mocks.parse).not.toHaveBeenCalled()
  })
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
  it('implements the turn contract and recomputes untrusted cached results', async () => {
    const r = await worker.fetch(
      turnReq({
        version: 1,
        mode: 'demo',
        history: [],
        result: { action: 'RECOMMEND', score: 100 },
      }),
      {},
    )
    expect(r.status).toBe(200)
    const data = (await r.json()) as {
      session: { history: unknown[]; result: { recommendations: unknown[] } }
      action: { type: string; question: unknown }
    }
    expect(data.action.type).toBe('question')
    expect(data.session.history).toEqual(history)
    expect(data.session.result.recommendations).toEqual([])
    expect(mocks.parse).not.toHaveBeenCalled()
  })
  it('validates version, history limits and required first answers at the turn boundary', async () => {
    for (const session of [
      { version: 99, mode: 'demo', history: [] },
      { version: 1, mode: 'demo', history: Array(7).fill(history[0]) },
    ])
      expect((await worker.fetch(turnReq(session), {})).status).toBe(400)
    expect(
      (
        await worker.fetch(
          turnReq(
            { version: 1, mode: 'demo', history: [] },
            { ...history[0], answer: '', skipped: true },
          ),
          {},
        )
      ).status,
    ).toBe(400)
    expect(mocks.parse).not.toHaveBeenCalled()
  })
  it('uses one provider call for a live turn and safely fills missing model candidates', async () => {
    mocks.parse.mockResolvedValue({
      output_parsed: { signals: [], hypotheses: [], candidateQuestions: [] },
    })
    const r = await worker.fetch(turnReq({ version: 1, mode: 'live', history: [] }), env)
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({
      action: { type: 'question' },
      session: { result: { mode: 'live', action: 'EXPLORE' } },
    })
    expect(mocks.parse).toHaveBeenCalledTimes(1)
  })
  it('retains cited semantic signals across turns while discarding forged cached evidence', async () => {
    const first = { ...history[0], answer: 'По вечерам сочиняю строфы' }
    const signal = {
      kind: 'fact',
      text: 'Пишет стихи',
      quote: first.answer,
      sourceId: first.id,
      domain: 'writing',
      lifeArea: 'creativity',
      negative: false,
      toolId: null,
      confidence: 0.7,
    }
    mocks.parse.mockResolvedValue({
      output_parsed: { signals: [], hypotheses: [], candidateQuestions: [] },
    })
    const r = await worker.fetch(
      turnReq(
        {
          version: 1,
          mode: 'live',
          history: [first],
          signals: [signal, { ...signal, quote: 'fabricated evidence', sourceId: 'missing' }],
        },
        {
          ...history[0],
          id: 'step-2',
          question: { ...introduction, id: 'question-2', lifeArea: 'learning' },
          answer: 'Изучаю новые учебные темы',
        },
      ),
      env,
    )
    expect(r.status).toBe(200)
    const data = (await r.json()) as { session: { signals: { quote: string }[] } }
    expect(data.session.signals.some((c) => c.quote === first.answer)).toBe(true)
    expect(JSON.stringify(data)).not.toContain('fabricated evidence')
    expect(mocks.parse.mock.calls[0][0].input).not.toContain('fabricated evidence')
    expect(mocks.parse).toHaveBeenCalledTimes(1)
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
    expect(await r.json()).toMatchObject({ errorCode: 'AI_LIMITER_UNAVAILABLE' })
  })
  it('applies shared IP rate limiting before calling provider', async () => {
    const limit = vi.fn().mockResolvedValue({ success: false })
    const r = await worker.fetch(
      req({ mode: 'live', history }, { 'CF-Connecting-IP': '192.0.2.1' }),
      { ...env, AI_RATE_LIMITER: { limit } },
    )
    expect(r.status).toBe(429)
    expect(await r.json()).toMatchObject({ errorCode: 'AI_RATE_LIMITED' })
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
        hypotheses: [],
        signals: [
          {
            kind: 'fact',
            text: 'Читаю документы',
            quote: 'Читаю документы',
            sourceId: 'step-1',
            domain: 'research',
            lifeArea: 'work',
            confidence: 0.7,
            negative: false,
            toolId: null,
          },
        ],
        candidateQuestions: [
          {
            ...introduction,
            id: 'next',
            component: 'ThisOrThat',
            targetGap: 'learning',
            lifeArea: 'learning',
            title: 'Как вам интереснее учиться?',
            options: [
              {
                id: 'reading',
                label: 'Читать учебные статьи',
                description: '',
                assetId: 'education',
              },
              {
                id: 'practice',
                label: 'Изучать на практике',
                description: '',
                assetId: 'education',
              },
            ],
          },
        ],
      },
    })
    const r = await worker.fetch(req({ mode: 'live', history }), env)
    expect(r.status).toBe(200)
    const data = (await r.json()) as { mode: string; memory: { confirmedFacts: unknown[] } }
    expect(data.mode).toBe('live')
    expect(data.memory.confirmedFacts).toHaveLength(1)
    expect(data).toMatchObject({
      question: { title: 'Как вам интереснее учиться?' },
    })
    const call = mocks.parse.mock.calls[0][0]
    expect(call.model).toBe('gpt-6.1-sol')
    expect(call.store).toBe(false)
    expect(call.max_output_tokens).toBe(8000)
    expect(JSON.stringify(call.text.format.schema)).not.toMatch(/minLength|maxLength/)
    expect(JSON.parse(call.input).candidateTools.length).toBeLessThanOrEqual(8)
    expect(call.text.format.type).toBe('json_schema')
    expect(Object.keys(call.text.format.schema.properties)).toEqual([
      'signals',
      'hypotheses',
      'candidateQuestions',
    ])
  })
  it('clips oversized model text and replaces an unusable question with a curated one', async () => {
    mocks.parse.mockResolvedValue({
      output_parsed: {
        hypotheses: [],
        signals: [
          {
            kind: 'fact',
            text: 'Читаю документы '.repeat(30),
            quote: 'Читаю документы',
            sourceId: 'step-1',
            domain: 'research',
            lifeArea: 'work',
            confidence: 0.7,
            negative: false,
            toolId: null,
          },
          {
            kind: 'fact',
            text: 'Пустая цитата',
            quote: ' ',
            sourceId: 'step-1',
            domain: 'research',
            lifeArea: 'work',
            confidence: 0.7,
            negative: false,
            toolId: null,
          },
        ],
        candidateQuestions: [
          {
            ...introduction,
            lifeArea: 'work',
            targetGap: 'familiarity',
            id: 'next',
            component: 'AppRecognition',
            title: 'Что из этого вам знакомо?',
            options: [
              { id: 'chatgpt', label: 'ChatGPT', description: '', assetId: 'productivity' },
              { id: 'excel', label: 'Excel', description: '', assetId: 'analytics' },
            ],
          },
        ],
      },
    })
    const r = await worker.fetch(req({ mode: 'live', history }), env)
    expect(r.status).toBe(200)
    const data = (await r.json()) as {
      question: { id: string; options: { id: string }[] }
      memory: { confirmedFacts: { text: string }[] }
    }
    expect(data.memory.confirmedFacts).toHaveLength(1)
    expect(data.memory.confirmedFacts[0].text.length).toBeLessThanOrEqual(240)
    expect(data.question.id).toBe('question-2')
    expect(data.question.options.map((o) => o.id)).not.toContain('excel')
  })
  it('replaces invalid model layouts safely and hides raw provider errors', async () => {
    mocks.parse.mockResolvedValue({
      output_parsed: {
        hypotheses: [],
        signals: [],
        candidateQuestions: [
          { ...introduction, lifeArea: 'learning', targetGap: 'learning', component: 'HTML' },
        ],
      },
    })
    const fallback = await worker.fetch(req({ mode: 'live', history }), env)
    expect(fallback.status).toBe(200)
    expect(await fallback.json()).toMatchObject({ mode: 'live', action: 'EXPLORE' })
    mocks.parse.mockRejectedValue(new Error('secret user answer'))
    const r = await worker.fetch(req({ mode: 'live', history }), env)
    expect(r.status).toBe(502)
    expect(await r.text()).not.toContain('secret user answer')
  })
  it.each([
    [404, 'model_not_found', 'AI_MODEL_UNAVAILABLE'],
    [401, 'invalid_api_key', 'AI_AUTH_FAILED'],
    [403, null, 'AI_ACCESS_DENIED'],
    [429, 'insufficient_quota', 'AI_QUOTA_EXCEEDED'],
    [429, 'billing_hard_limit_reached', 'AI_QUOTA_EXCEEDED'],
    [429, 'rate_limit_exceeded', 'AI_PROVIDER_RATE_LIMITED'],
    [400, 'invalid_json_schema', 'AI_REQUEST_REJECTED'],
    [500, null, 'AI_PROVIDER_UNAVAILABLE'],
  ] as const)(
    'classifies provider %s / %s without disclosing raw details',
    async (status, code, expected) => {
      mocks.parse.mockRejectedValue(
        new APIError(
          status,
          {
            code,
            message: 'private credential and user answer',
            param: 'private parameter',
          },
          undefined,
          new Headers(),
        ),
      )
      const r = await worker.fetch(req({ mode: 'live', history }), env)
      expect(r.status).toBe(502)
      const data = await r.json()
      expect(data).toMatchObject({ errorCode: expected })
      expect(JSON.stringify(data)).not.toContain('private')
      expect(mocks.parse).toHaveBeenCalledTimes(1)
    },
  )
  it('distinguishes an actual SDK timeout and incomplete or unparseable responses', async () => {
    mocks.parse.mockRejectedValueOnce(
      new APIConnectionTimeoutError({ message: 'private timeout detail' }),
    )
    const timeout = await worker.fetch(req({ mode: 'live', history }), env)
    expect(timeout.status).toBe(504)
    expect(await timeout.json()).toMatchObject({ errorCode: 'AI_TIMEOUT' })
    mocks.parse.mockResolvedValueOnce({ status: 'incomplete', output_parsed: null })
    expect(await (await worker.fetch(req({ mode: 'live', history }), env)).json()).toMatchObject({
      errorCode: 'AI_RESPONSE_INCOMPLETE',
    })
    mocks.parse.mockRejectedValueOnce(new SyntaxError('private response fragment'))
    const invalid = await worker.fetch(req({ mode: 'live', history }), env)
    expect(await invalid.json()).toMatchObject({ errorCode: 'AI_RESPONSE_INVALID' })
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
