// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  knowledgeContext,
  loadSources,
  parseCSV,
  parseSheet,
  parseTools,
  sourceIds,
  SourceError,
} from '../worker/sources'
import { website } from '../src/lib/website'
afterEach(() => vi.unstubAllGlobals())
describe('three spreadsheet sources', () => {
  it('accepts the actual tools-table columns without inventing missing websites', () => {
    const sheet = parseSheet(
      '№,Инструмент,Категория,Уровень,Назначение\n1,ChatGPT,Универсальные ассистенты,S,Текст и анализ файлов\n2,Claude,Универсальные ассистенты,S,Работа с документами',
      sourceIds[2],
      '',
    )
    expect(
      parseTools(sheet, {}).map((t) => ({ name: t.name, officialUrl: t.officialUrl })),
    ).toEqual([
      { name: 'ChatGPT', officialUrl: null },
      { name: 'Claude', officialUrl: null },
    ])
  })
  it('follows bounded redirects to Google download hosts', async () => {
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes(sourceIds[2]))
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://doc-download.googleusercontent.com/sheet.csv' },
        })
      return new Response(
        url.includes('googleusercontent.com') ? 'Инструмент\nChatGPT' : 'Case\nWriting',
      )
    })
    vi.stubGlobal('fetch', fetch)
    const sources = await loadSources({ TOOLS_GID: '910' })
    expect(sources.tools).toHaveLength(1)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(fetch.mock.calls.at(-1)![0]).toBe('https://doc-download.googleusercontent.com/sheet.csv')
  })
  it.each([
    ['https://accounts.google.com/ServiceLogin', 'access_denied'],
    ['https://untrusted.example/download', 'redirect_blocked'],
    ['http://docs.google.com/download', 'redirect_blocked'],
  ])('diagnoses and rejects redirect to %s without following it', async (location, reason) => {
    const fetch = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.includes(sourceIds[2])
          ? new Response(null, { status: 302, headers: { Location: location } })
          : new Response('Case\nWriting'),
      )
    vi.stubGlobal('fetch', fetch)
    await expect(loadSources({ TOOLS_GID: '911' })).rejects.toMatchObject({
      code: 'DATA_SOURCES_UNAVAILABLE',
      sources: [
        { role: 'use_cases', ready: true },
        { role: 'possible_solutions', ready: true },
        { role: 'tools', ready: false, reason, httpStatus: 302 },
      ],
    })
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('reports each source independently without disclosing provider pages or raw errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes(sourceIds[0])) return new Response('private sign-in page', { status: 401 })
        if (url.includes(sourceIds[1])) throw new Error('private credentials')
        return new Response('Инструмент\nChatGPT')
      }),
    )
    try {
      await loadSources({ TOOLS_GID: '912' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(SourceError)
      expect((error as SourceError).sources).toMatchObject([
        { role: 'use_cases', ready: false, reason: 'access_denied', httpStatus: 401 },
        { role: 'possible_solutions', ready: false, reason: 'network_error' },
        { role: 'tools', ready: true, rows: 1, toolsWithWebsite: 0, toolsNeedingWebsite: 1 },
      ])
      expect(JSON.stringify((error as SourceError).sources)).not.toContain('private')
    }
  })
  it('preserves quoted commas, newlines, quotes, BOM and source row numbers', () => {
    const csv =
      '\uFEFFНазвание,Сайт,Описание\r\nTool,https://tool.example,"Text, first\nsecond ""quote"""\r\n\r\nNext,https://next.example,Other'
    const sheet = parseSheet(csv, sourceIds[2], '42')
    const tools = parseTools(sheet, {})
    expect(sheet.rows.map((r) => r.row)).toEqual([2, 4])
    expect(tools[0]).toMatchObject({
      name: 'Tool',
      officialUrl: 'https://tool.example/',
      sourceUrl: expect.stringContaining('gid=42&range=A2'),
    })
    expect(tools[0].row.values['Описание']).toBe('Text, first\nsecond "quote"')
    expect(parseCSV('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
  it('prefers an official website column and supports explicit custom column mapping', () => {
    const sheet = parseSheet(
      'Product,Link,Official website\nTool,https://review.example,https://tool.example',
      sourceIds[2],
      '0',
    )
    expect(parseTools(sheet, {})[0].officialUrl).toBe('https://tool.example/')
    const custom = parseSheet('Программа,Адрес\nTool,https://tool.example', sourceIds[2], '0')
    expect(() => parseTools(custom, {})).toThrow(SourceError)
    expect(
      parseTools(custom, { TOOL_NAME_COLUMN: 'Программа', TOOL_URL_COLUMN: 'Адрес' })[0].name,
    ).toBe('Tool')
  })
  it.each([
    '<html>Login</html>',
    'Name,Name\na,b',
    'Name,URL\n',
    'Name,URL\n"broken,https://tool.example',
  ])('rejects invalid or empty tables: %s', (csv) => {
    expect(() => parseSheet(csv, sourceIds[2], '0')).toThrow(SourceError)
  })
  it('rejects invalid tool rows instead of inventing a catalog miss', () => {
    const sheet = parseSheet('Name,URL\nTool,javascript:alert(1)', sourceIds[2], '0')
    expect(() => parseTools(sheet, {})).toThrow(SourceError)
  })
  it.each([
    'javascript:alert(1)',
    'http://tool.example',
    'https://user:password@tool.example',
    'https://127.0.0.1',
    'https://0x7f000001',
    'https://[::1]',
    'https://localhost',
    'https://service.internal',
    'https://tool.example:8443',
  ])('rejects unsafe website %s', (url) => expect(website(url)).toBeNull())
  it('loads all three configured tabs and shares a successful warm-worker cache', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(
        async (url: string) =>
          new Response(
            url.includes(sourceIds[2])
              ? 'Name,URL,Use cases\nTool,https://tool.example,writing'
              : 'Case,Solution\nWriting,Draft',
          ),
      )
    vi.stubGlobal('fetch', fetch)
    const config = { KNOWLEDGE_1_GID: '10', KNOWLEDGE_2_GID: '20', TOOLS_GID: '30' }
    const a = await loadSources(config),
      b = await loadSources(config)
    expect(a).toBe(b)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(
      sourceIds.map((id, i) =>
        expect.stringContaining(`${id}/gviz/tq?tqx=out:csv&gid=${[10, 20, 30][i]}`),
      ),
    )
    expect(knowledgeContext(a, 'Writing').map((s) => s.role)).toEqual([
      'use_cases',
      'possible_solutions',
    ])
    expect(a.tools).toHaveLength(1)
  })
  it('does not cache failures or mistake a closed sheet for missing tools', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('Sign in', { status: 403 }))
    vi.stubGlobal('fetch', fetch)
    const config = { TOOLS_GID: '901' }
    await expect(loadSources(config)).rejects.toMatchObject({ code: 'DATA_SOURCES_UNAVAILABLE' })
    await expect(loadSources(config)).rejects.toMatchObject({ code: 'DATA_SOURCES_UNAVAILABLE' })
    expect(fetch).toHaveBeenCalledTimes(6)
  })
})
