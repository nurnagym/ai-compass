// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type OpenAI from 'openai'
import { resolveRecommendations, searchConstraints } from '../worker/recommendations'
import { parseSheet, parseTools, sourceIds, type Sources } from '../worker/sources'
import { decide, introduction } from '../src/features/onboarding/director'
import { buildRecommendations } from '../src/features/evidence/scoring'
import type { Interaction } from '../src/types/session'

const history: Interaction[] = Array.from({ length: 7 }, (_, i) => ({
  id: `step-${i + 1}`,
  question: { ...introduction, id: i ? `q-${i}` : 'intro' },
  answer: i ? '' : 'Работаю с текстами, мой секретный пример — Петя.',
  skipped: !!i,
}))
const result = decide(history, [], undefined, 'live')
const targets = buildRecommendations(result.memory, history, true)
const sheet = parseSheet(
  'Name,Official URL,Capabilities\nTest Writer,https://writer.example,Writing and research',
  sourceIds[2],
  '0',
)
const sources: Sources = {
  knowledge: sourceIds
    .slice(0, 2)
    .map((id) => parseSheet('Case,Solution\nWriting,Drafts', id, '0')),
  toolsSheet: sheet,
  tools: parseTools(sheet, {}),
  loadedAt: '2026-10-17T00:00:00.000Z',
}
const selections = () =>
  targets.map((r, index) => ({
    index,
    toolId: sources.tools[0].id as string | null,
    opportunity: r.opportunity,
    reason: 'Подходит для черновиков и позволяет начать с небольшого текста.',
    workflow: ['Возьмите вымышленный пример.', 'Создайте и проверьте черновик.'],
    contextRowIds: [sources.knowledge[0].rows[0].id],
  }))
const webTool = {
  index: 0,
  name: 'Found Writer',
  officialUrl: 'https://found.example/',
  sourceUrl: 'https://found.example/features',
  description: 'Помогает с текстом',
  reason: 'Поддерживает нужный сценарий',
  workflow: ['Создайте пример.', 'Проверьте результат.'],
  limitations: ['Условия могут меняться.'],
}
const webResult = () => ({
  status: 'completed',
  output_parsed: { tools: [webTool] },
  output: [
    {
      type: 'web_search_call',
      status: 'completed',
      action: { type: 'search', sources: [{ type: 'url', url: webTool.sourceUrl }] },
    },
  ],
})
const run = (parse: ReturnType<typeof vi.fn>, charge = vi.fn().mockResolvedValue(undefined)) =>
  resolveRecommendations(
    result,
    history,
    sources,
    { responses: { parse } } as unknown as OpenAI,
    'configured-model',
    charge,
    AbortSignal.timeout(1000),
    'low',
  )

describe('catalog first, live web search only for a database miss', () => {
  it('creates evidenced data opportunities even when that scenario has no demo tool mapping', () => {
    const turns = history.map((h, i) =>
      i ? h : { ...h, answer: 'Работаю с данными и таблицами Excel' },
    )
    const state = decide(turns, [], undefined, 'live')
    const candidates = buildRecommendations(state.memory, turns, true)
    expect(candidates[0]).toMatchObject({
      opportunityId: 'external:work:data',
      lifeArea: 'work',
      sourceIds: ['step-1'],
    })
    expect(candidates[0].evidenceQuotes).toContain('Работаю с данными и таблицами Excel')
  })
  it('forwards normalized constraints from free text without personal text or skipped answers', () => {
    const turns = [
      {
        ...history[0],
        answer:
          'Меня зовут Петя, только в браузере, без установки, только бесплатно, не программист. Только Android.',
      },
      { ...history[0], id: 'skipped', answer: 'только офлайн', skipped: true },
    ]
    expect(searchConstraints(turns)).toEqual([
      'browser_only',
      'no_installation',
      'free_only',
      'no_coding',
      'platform_android',
    ])
    expect(
      searchConstraints([{ ...history[0], answer: 'Не только браузер, not only phone.' }]),
    ).toEqual([])
  })
  it('uses database IDs and original official URLs, without any web search when all targets match', async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: { selections: selections() } }),
      charge = vi.fn().mockResolvedValue(undefined)
    const resolved = await run(parse, charge)
    expect(parse).toHaveBeenCalledTimes(1)
    expect(charge).toHaveBeenCalledTimes(1)
    expect(parse.mock.calls[0][0]).toMatchObject({
      model: 'configured-model',
      store: false,
      reasoning: { effort: 'low' },
    })
    expect(parse.mock.calls[0][0].tools).toBeUndefined()
    expect(resolved.recommendations).toHaveLength(targets.length)
    for (const rec of resolved.recommendations) {
      expect(rec.tool).toMatchObject({
        name: 'Test Writer',
        officialUrl: 'https://writer.example/',
        source: 'sheet',
        contextSources: [{ url: sources.knowledge[0].url, row: 2 }],
      })
      expect(rec.toolId).toBe(sources.tools[0].id)
      expect(rec.why).toContain(rec.sourceIds.length ? 'Вы рассказали' : 'осторожная идея')
      expect(rec.workflow).toHaveLength(2)
    }
  })
  it('searches only missing targets and validates actual official-source evidence', async () => {
    const chosen = selections()
    chosen[0] = { ...chosen[0], toolId: null }
    const parse = vi
      .fn()
      .mockResolvedValueOnce({ output_parsed: { selections: chosen } })
      .mockResolvedValueOnce(webResult())
    const charge = vi.fn().mockResolvedValue(undefined),
      resolved = await run(parse, charge)
    expect(charge).toHaveBeenCalledTimes(2)
    expect(parse.mock.calls[1][0]).toMatchObject({
      tools: [{ type: 'web_search', external_web_access: true }],
      tool_choice: 'required',
      max_tool_calls: 4,
      include: ['web_search_call.action.sources'],
    })
    const input = JSON.parse(parse.mock.calls[1][0].input)
    expect(input.tasks).toHaveLength(1)
    expect(JSON.stringify(input)).not.toContain('Петя')
    expect(JSON.stringify(input)).not.toContain('секретный')
    expect(resolved.recommendations[0].tool).toMatchObject({
      name: 'Found Writer',
      officialUrl: 'https://found.example/',
      source: 'web',
      sourceUrl: webTool.sourceUrl,
    })
    expect(resolved.recommendations.slice(1).every((r) => r.tool?.source === 'sheet')).toBe(true)
  })
  it.each(['no-search', 'fake-source', 'different-host', 'unsafe-url'])(
    'rejects an ungrounded or unsafe search result: %s',
    async (kind) => {
      const chosen = selections()
      chosen[0] = { ...chosen[0], toolId: null }
      const web = webResult()
      if (kind === 'no-search') web.output = []
      if (kind === 'fake-source')
        web.output_parsed.tools[0] = { ...webTool, sourceUrl: 'https://found.example/not-cited' }
      if (kind === 'different-host')
        web.output_parsed.tools[0] = { ...webTool, officialUrl: 'https://invented.example' }
      if (kind === 'unsafe-url')
        web.output_parsed.tools[0] = { ...webTool, officialUrl: 'javascript:alert(1)' }
      const parse = vi
        .fn()
        .mockResolvedValueOnce({ output_parsed: { selections: chosen } })
        .mockResolvedValueOnce(web)
      await expect(run(parse)).rejects.toThrow('AI_RESPONSE_INVALID')
    },
  )
  it('rejects invented catalog IDs and source references instead of treating them as misses', async () => {
    for (const change of [{ toolId: 'invented' }, { contextRowIds: ['invented-row'] }]) {
      const chosen = selections()
      chosen[0] = { ...chosen[0], ...change }
      const parse = vi.fn().mockResolvedValue({ output_parsed: { selections: chosen } })
      await expect(run(parse)).rejects.toThrow('AI_RESPONSE_INVALID')
      expect(parse).toHaveBeenCalledTimes(1)
    }
  })
  it('reports no grounded result rather than substituting a demo tool', async () => {
    const chosen = selections()
    chosen[0] = { ...chosen[0], toolId: null }
    const web = webResult()
    web.output_parsed.tools = []
    const parse = vi
      .fn()
      .mockResolvedValueOnce({ output_parsed: { selections: chosen } })
      .mockResolvedValueOnce(web)
    await expect(run(parse)).rejects.toThrow('TOOL_SEARCH_UNAVAILABLE')
  })
  it('checks the cost limiter before starting the fallback search', async () => {
    const chosen = selections()
    chosen[0] = { ...chosen[0], toolId: null }
    const parse = vi.fn().mockResolvedValueOnce({ output_parsed: { selections: chosen } })
    const charge = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('limited'))
    await expect(run(parse, charge)).rejects.toThrow('limited')
    expect(parse).toHaveBeenCalledTimes(1)
  })
  it('does not resolve tools during discovery', async () => {
    const discovery = decide(history.slice(0, 1), [], undefined, 'live')
    const parse = vi.fn()
    expect(
      await resolveRecommendations(
        discovery,
        history.slice(0, 1),
        sources,
        { responses: { parse } } as unknown as OpenAI,
        'model',
        async () => {},
        AbortSignal.timeout(1000),
      ),
    ).toBe(discovery)
    expect(parse).not.toHaveBeenCalled()
  })
})
