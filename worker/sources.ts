import { website } from '../src/lib/website'

export const sourceIds = [
  '1Uk3-nk4VPg2wX_uYDhXYBUF7jWabbSyYHVM3Tl7sJVI',
  '13dH8yDs8HL1drgZXz9KqoamT61tSYAEqDLmv66gzzFs',
  '1TIMQB7ZdTtL2tKcUu9RISB33TEXjdHDRSuMTRlVowjU',
] as const
export interface SourceConfig {
  SHEETS_ENABLED?: string
  KNOWLEDGE_1_GID?: string
  KNOWLEDGE_2_GID?: string
  TOOLS_GID?: string
  TOOL_NAME_COLUMN?: string
  TOOL_URL_COLUMN?: string
}
export class SourceError extends Error {
  constructor(
    public code: 'DATA_SOURCES_UNAVAILABLE' | 'DATA_SOURCE_INVALID',
    public reason: SourceFailureReason = code === 'DATA_SOURCE_INVALID'
      ? 'invalid_table'
      : 'network_error',
    public httpStatus?: number,
    public sources?: SourceStatus[],
  ) {
    super(code)
  }
}
export type SourceFailureReason =
  | 'access_denied'
  | 'not_found'
  | 'http_error'
  | 'unexpected_html'
  | 'network_error'
  | 'timeout'
  | 'redirect_blocked'
  | 'invalid_table'
  | 'invalid_configuration'
export interface SourceStatus {
  role: 'use_cases' | 'possible_solutions' | 'tools'
  url: string
  ready: boolean
  rows?: number
  toolsWithWebsite?: number
  toolsNeedingWebsite?: number
  errorCode?: SourceError['code']
  reason?: SourceFailureReason
  httpStatus?: number
}
export interface SourceRow {
  id: string
  row: number
  values: Record<string, string>
}
export interface Sheet {
  id: string
  url: string
  rows: SourceRow[]
}
export interface SheetTool {
  id: string
  name: string
  officialUrl: string | null
  row: SourceRow
  sourceUrl: string
}
export interface Sources {
  knowledge: Sheet[]
  tools: SheetTool[]
  toolsSheet: Sheet
  loadedAt: string
}
const invalid = () => new SourceError('DATA_SOURCE_INVALID')
const key = (s: string) => s.toLowerCase().replace(/[\s_\-().:/]+/g, '')

// RFC 4180 fields, quoted newlines and escaped quotes; preserve original spreadsheet row numbers.
export function parseCSV(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [],
    field = '',
    quoted = false
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') {
        field += '"'
        i++
      } else if (quoted || !field) quoted = !quoted
      else throw invalid()
    } else if (c === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((c === '\n' || c === '\r') && !quoted) {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      if (c === '\r' && csv[i + 1] === '\n') i++
    } else field += c
  }
  if (quoted) throw invalid()
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}
export function parseSheet(csv: string, id: string, gid: string): Sheet {
  if (/^\s*</.test(csv)) throw invalid()
  const rows = parseCSV(csv.replace(/^\uFEFF/, ''))
  const headerAt = rows.findIndex((r) => r.some((v) => v.trim()))
  const headers = rows[headerAt]?.map((v) => v.trim())
  if (
    !headers?.length ||
    headers.length > 60 ||
    headers.some((h) => !h || h.length > 120) ||
    new Set(headers.map(key)).size !== headers.length
  )
    throw invalid()
  const data: SourceRow[] = []
  for (let i = headerAt + 1; i < rows.length; i++) {
    const cells = rows[i].map((v) => v.trim())
    if (!cells.some(Boolean)) continue
    if (cells.length > headers.length || cells.some((v) => v.length > 6000)) throw invalid()
    data.push({
      id: `${id}:${gid || 'first'}:${i + 1}`,
      row: i + 1,
      values: Object.fromEntries(headers.map((h, j) => [h, cells[j] ?? ''])),
    })
  }
  if (!data.length || data.length > 500) throw invalid()
  return {
    id,
    url: `https://docs.google.com/spreadsheets/d/${id}/edit${gid ? `#gid=${gid}` : ''}`,
    rows: data,
  }
}
export function rowUrl(url: string, row: number) {
  return `${url}${url.includes('#') ? '&' : '#'}range=A${row}`
}
export function parseTools(sheet: Sheet, config: SourceConfig): SheetTool[] {
  const headers = Object.keys(sheet.rows[0].values)
  const find = (configured: string | undefined, aliases: string[]) =>
    headers.find((h) => (configured ? key(h) === key(configured) : aliases.includes(key(h))))
  const name = find(config.TOOL_NAME_COLUMN, [
    'name',
    'tool',
    'toolname',
    'aitool',
    'aitoolname',
    'product',
    'productname',
    'название',
    'инструмент',
    'названиеинструмента',
    'сервис',
    'названиепродукта',
  ])
  const url =
    find(config.TOOL_URL_COLUMN, [
      'officialurl',
      'officialwebsite',
      'website',
      'сайт',
      'официальныйсайт',
      'ссылканасайт',
      'ссылканаинструмент',
    ]) ?? find(config.TOOL_URL_COLUMN, ['url', 'link', 'toolurl', 'toollink', 'ссылка'])
  if (!name) throw invalid()
  return sheet.rows.map((row) => {
    const rawUrl = url ? row.values[url] : ''
    const officialUrl = rawUrl
      ? website(/^www\./i.test(rawUrl) ? `https://${rawUrl}` : rawUrl)
      : null
    if ((rawUrl && !officialUrl) || !row.values[name] || row.values[name].length > 120)
      throw invalid()
    return {
      id: row.id,
      name: row.values[name],
      officialUrl,
      row,
      sourceUrl: rowUrl(sheet.url, row.row),
    }
  })
}
async function readSheet(id: string, gid: string): Promise<Sheet> {
  if (gid && !/^\d+$/.test(gid))
    throw new SourceError('DATA_SOURCE_INVALID', 'invalid_configuration')
  const abort = new AbortController(),
    timeout = setTimeout(() => abort.abort(), 10000)
  try {
    let url = new URL(
      `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`,
    )
    let response: Response | undefined
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await fetch(url.href, {
        signal: abort.signal,
        redirect: 'manual',
        headers: { Accept: 'text/csv' },
      })
      if (![301, 302, 303, 307, 308].includes(response.status)) break
      const location = response.headers.get('Location')
      const status = response.status
      await response.body?.cancel()
      if (!location) throw new SourceError('DATA_SOURCES_UNAVAILABLE', 'redirect_blocked', status)
      const next = new URL(location, url)
      if (next.hostname === 'accounts.google.com')
        throw new SourceError('DATA_SOURCES_UNAVAILABLE', 'access_denied', status)
      if (
        redirects === 3 ||
        next.protocol !== 'https:' ||
        next.username ||
        next.password ||
        next.port ||
        !(next.hostname === 'docs.google.com' || next.hostname.endsWith('.googleusercontent.com'))
      )
        throw new SourceError('DATA_SOURCES_UNAVAILABLE', 'redirect_blocked', status)
      url = next
    }
    if (!response!.ok) {
      const status = response!.status
      await response!.body?.cancel()
      throw new SourceError(
        'DATA_SOURCES_UNAVAILABLE',
        status === 401 || status === 403
          ? 'access_denied'
          : status === 404
            ? 'not_found'
            : 'http_error',
        status,
      )
    }
    if (!response!.body) throw new SourceError('DATA_SOURCES_UNAVAILABLE', 'network_error')
    if (/html/i.test(response!.headers.get('Content-Type') ?? '')) {
      await response!.body.cancel()
      throw new SourceError('DATA_SOURCES_UNAVAILABLE', 'unexpected_html', response!.status)
    }
    const reader = response!.body.getReader()
    const decoder = new TextDecoder()
    let csv = '',
      size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 2 * 1024 * 1024) {
          await reader.cancel()
          throw invalid()
        }
        csv += decoder.decode(value, { stream: true })
      }
      csv += decoder.decode()
    } finally {
      reader.releaseLock()
    }
    return parseSheet(csv, id, gid)
  } catch (error) {
    if (error instanceof SourceError) throw error
    throw new SourceError(
      'DATA_SOURCES_UNAVAILABLE',
      abort.signal.aborted ? 'timeout' : 'network_error',
    )
  } finally {
    clearTimeout(timeout)
  }
}
let cached: { key: string; until: number; value: Promise<Sources> } | undefined
export function loadSources(config: SourceConfig): Promise<Sources> {
  const gids = [config.KNOWLEDGE_1_GID ?? '', config.KNOWLEDGE_2_GID ?? '', config.TOOLS_GID ?? '']
  const cacheKey = JSON.stringify([gids, config.TOOL_NAME_COLUMN, config.TOOL_URL_COLUMN])
  if (cached?.key === cacheKey && cached.until > Date.now()) return cached.value
  const value = Promise.allSettled(
    sourceIds.map(async (id, i) => {
      const sheet = await readSheet(id, gids[i])
      return { sheet, tools: i === 2 ? parseTools(sheet, config) : [] }
    }),
  ).then((results) => {
    const statuses: SourceStatus[] = results.map((r, i) => ({
      role: i === 0 ? 'use_cases' : i === 1 ? 'possible_solutions' : 'tools',
      url: `https://docs.google.com/spreadsheets/d/${sourceIds[i]}/edit${gids[i] ? `#gid=${gids[i]}` : ''}`,
      ...(r.status === 'fulfilled'
        ? {
            ready: true,
            rows: r.value.sheet.rows.length,
            ...(i === 2
              ? {
                  toolsWithWebsite: r.value.tools.filter((t) => t.officialUrl).length,
                  toolsNeedingWebsite: r.value.tools.filter((t) => !t.officialUrl).length,
                }
              : {}),
          }
        : {
            ready: false,
            errorCode: r.reason instanceof SourceError ? r.reason.code : 'DATA_SOURCES_UNAVAILABLE',
            reason: r.reason instanceof SourceError ? r.reason.reason : 'network_error',
            ...(r.reason instanceof SourceError && r.reason.httpStatus
              ? { httpStatus: r.reason.httpStatus }
              : {}),
          }),
    }))
    const failed = statuses.find((s) => !s.ready)
    if (failed)
      throw new SourceError(failed.errorCode!, failed.reason!, failed.httpStatus, statuses)
    const data = results.map((r) => {
      if (r.status !== 'fulfilled') throw invalid()
      return r.value
    })
    return {
      knowledge: data.slice(0, 2).map((d) => d.sheet),
      toolsSheet: data[2].sheet,
      tools: data[2].tools,
      loadedAt: new Date().toISOString(),
    }
  })
  const entry = { key: cacheKey, until: Date.now() + 5 * 60 * 1000, value }
  cached = entry
  void value.catch(() => {
    if (cached === entry) cached = undefined
  })
  return value
}
export function knowledgeContext(sources: Sources, query: string) {
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\d]{4,}/gu) ?? [])]
  return sources.knowledge.map((sheet, index) => ({
    role: index === 0 ? 'use_cases' : 'possible_solutions',
    url: sheet.url,
    totalRows: sheet.rows.length,
    rows: [...sheet.rows]
      .sort((a, b) => {
        const score = (r: SourceRow) => {
          const text = JSON.stringify(r.values).toLowerCase()
          return words.reduce((sum, w) => sum + Number(text.includes(w)), 0)
        }
        return score(b) - score(a)
      })
      .slice(0, 20)
      .map((r) => ({
        ...r,
        values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, v.slice(0, 800)])),
      })),
  }))
}
