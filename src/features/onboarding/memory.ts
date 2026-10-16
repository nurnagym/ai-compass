import type { Claim, Domain, Interaction, Memory } from '../../types/session'
import { catalog } from '../../data/catalog'
export const emptyMemory = (): Memory => ({
  confirmedFacts: [],
  goals: [],
  interests: [],
  toolsUsed: [],
  hypotheses: [],
  unknowns: [],
  contradictions: [],
})
export function buildMemory(claims: Claim[], history: Interaction[]): Memory {
  const memory = emptyMemory()
  const seen = new Set<string>()
  for (const claim of claims.slice(0, 28)) {
    const source = history.find((h) => h.id === claim.sourceId && !h.skipped)
    // An exact source quote is mandatory. Model assertions are never evidence by themselves.
    if (
      !source ||
      !claim.quote.trim() ||
      !source.answer.toLowerCase().includes(claim.quote.toLowerCase())
    )
      continue
    if (claim.kind === 'tool' && claim.toolId && !catalog.some((t) => t.id === claim.toolId))
      continue
    const key = `${claim.kind}:${claim.domain}:${claim.sourceId}:${claim.negative}:${claim.toolId}`
    if (seen.has(key)) continue
    seen.add(key)
    const field = {
      fact: 'confirmedFacts',
      goal: 'goals',
      interest: 'interests',
      tool: 'toolsUsed',
      hypothesis: 'hypotheses',
    } as const
    memory[field[claim.kind]].push(claim)
  }
  const supported = [...memory.confirmedFacts, ...memory.goals, ...memory.interests]
  for (const domain of new Set(supported.map((c) => c.domain))) {
    const items = supported.filter((c) => c.domain === domain && c.kind !== 'interest')
    if (items.some((c) => c.negative) && items.some((c) => !c.negative))
      memory.contradictions.push({ domain, sourceIds: [...new Set(items.map((c) => c.sourceId))] })
  }
  memory.unknowns = []
  if (!supported.some((c) => !c.negative)) memory.unknowns.push('Конкретная задача или интерес')
  if (!history.some((h) => h.question.targetGap === 'constraints' && !h.skipped))
    memory.unknowns.push('Устройство и ограничения установки')
  if (
    !memory.toolsUsed.length &&
    !history.some((h) => h.question.targetGap === 'familiarity' && !h.skipped)
  )
    memory.unknowns.push('Знакомые инструменты')
  for (const contradiction of memory.contradictions)
    memory.unknowns.push(`Уточнить противоречие: ${contradiction.domain}`)
  return memory
}
const patterns: Record<Domain, RegExp> = {
  research: /исслед|источник|стат[ььи]|документ|research|reading|paper|pdf/i,
  data: /таблиц|excel|данн|аналитик|spreadsheet|data|analytics/i,
  writing: /текст|писать|пишу|пишет|writing|write|essay|письм/i,
  design: /фото|изображ|дизайн|рисова|photograph|design|image|draw/i,
  video: /видео|ролик|монтаж|video|film/i,
  audio: /аудио|голос|запис|расшифр|audio|voice|transcri/i,
  coding: /программ|разработ|код|coding|developer|software/i,
  productivity: /рутин|повтор|админ|офис|задач|замет|организ|office|repetitive|admin|notes/i,
  learning: /учусь|студент|уч[её]б|изуч|универс|student|learn|university/i,
  presentations: /презентац|слайд|presentation|slides/i,
  communication: /встреч|совещан|общени|перепис|meeting|communicat/i,
  everyday: /повседнев|обычн|быт|рецепт|путешеств|everyday|recipe|travel/i,
}
export function extractDemoClaims(history: Interaction[]): Claim[] {
  const claims: Claim[] = []
  for (const h of history.filter((h) => !h.skipped)) {
    // Familiarity answers contain product names, not evidence of activities or rejected needs.
    for (const [domain, pattern] of Object.entries(
      h.question.component === 'AppRecognition' ? {} : patterns,
    )) {
      // A swipe reaction describes an interest, not a universal rejection of an entire subject.
      for (const clause of h.answer.split(/[.;\n]/).filter((s) => pattern.test(s))) {
        const match = pattern.exec(clause)!
        const before = clause.slice(Math.max(0, match.index - 35), match.index)
        claims.push({
          kind: /^(?:Не )?Интересно:/i.test(clause.trim())
            ? 'interest'
            : /хочу|нужно|хотел|want|need/i.test(clause)
              ? 'goal'
              : 'fact',
          text: clause.trim().slice(0, 240),
          quote: clause.trim().slice(0, 240),
          sourceId: h.id,
          domain: domain as Domain,
          negative: /\bnot\b|\bdon't\b|не\s+(?:\S+\s+){0,2}$|без\s*$|не\s+интерес/i.test(before),
          toolId: null,
        })
      }
    }
    for (const name of ['Excel', 'Google Sheets', 'PowerPoint']) {
      if (h.answer.includes(name) && /работаю|использую|use|work/i.test(h.answer))
        claims.push({
          kind: 'tool',
          text: name,
          quote: h.answer.slice(0, 240),
          sourceId: h.id,
          domain: 'productivity',
          negative: false,
          toolId: null,
        })
    }
    for (const t of catalog) {
      if (
        h.answer
          .split(/[;\n]/)
          .some(
            (clause) =>
              clause.toLowerCase().includes(t.name.toLowerCase()) &&
              /использую|пользуюсь|уже использ|\buse\b/i.test(clause) &&
              !/не использ|не польз|don't use/i.test(clause),
          )
      )
        claims.push({
          kind: 'tool',
          text: t.name,
          quote: h.answer.slice(0, 240),
          sourceId: h.id,
          domain: t.supportedUseCases[0],
          negative: false,
          toolId: t.id,
        })
    }
  }
  return claims
}
