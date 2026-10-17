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
