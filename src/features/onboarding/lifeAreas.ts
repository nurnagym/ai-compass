import type { Claim, Domain, Interaction, LifeArea } from '../../types/session'

export const areaNames: Record<LifeArea, string> = {
  work: 'работы и карьеры',
  learning: 'учёбы и новых знаний',
  creativity: 'творчества и увлечений',
  everyday: 'повседневной жизни',
  relationships: 'общения с близкими',
}

export function defaultLifeArea(domain: Domain): LifeArea {
  if (domain === 'learning') return 'learning'
  if (domain === 'design' || domain === 'video') return 'creativity'
  if (domain === 'everyday') return 'everyday'
  if (domain === 'communication') return 'relationships'
  return 'work'
}

function explicitArea(text: string): LifeArea | undefined {
  if (/(?:^|[^\p{L}])(?:работ|карьер|резюме|ваканс|офис)/iu.test(text)) return 'work'
  if (/учусь|уч[её]б|студент|универс|изучаю|learn|student/i.test(text)) return 'learning'
  if (/увлеч|хобби|творче|свободн.*врем|портрет|фотограф|рисова/i.test(text)) return 'creativity'
  if (/путешеств|поездк|бытов|повседнев|рецепт/i.test(text)) return 'everyday'
  if (/друз|семь|близк|родител/i.test(text)) return 'relationships'
  return undefined
}
export function inferLifeArea(text: string, interaction: Interaction, domain: Domain): LifeArea {
  return (
    explicitArea(text) ??
    interaction.question.lifeArea ??
    explicitArea(interaction.answer) ??
    defaultLifeArea(domain)
  )
}

// Prototype guard: system claims and hypotheses must never assert a medical diagnosis.
export const assertsDiagnosis = (text: string) =>
  /диагноз|депресси|биполяр|шизофрен|психическ.*расстрой|у вас.*(?:сдвг|аутизм)/i.test(text)

export const claimArea = (claim: Claim): LifeArea => claim.lifeArea ?? defaultLifeArea(claim.domain)
export const normalized = (text: string) =>
  text
    .toLocaleLowerCase('ru')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

export function independentSourceIds(history: Interaction[]): Set<string> {
  const seen = new Set<string>(),
    ids = new Set<string>()
  for (const h of history) {
    const value = normalized(h.answer)
    if (
      h.skipped ||
      value.length < 2 ||
      /^(?:не знаю|пока не знаю|не уверен|не уверена|привет|нет|да|ок)$/.test(value) ||
      seen.has(value)
    )
      continue
    seen.add(value)
    ids.add(h.id)
  }
  return ids
}
