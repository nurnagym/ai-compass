import { opportunities, type Opportunity } from '../../data/opportunities'
import { verifiedCatalog } from '../../data/catalog'
import {
  lifeAreas,
  MAX_STEPS,
  type Claim,
  type Coverage,
  type DiscoveryHypothesis,
  type Interaction,
  type Memory,
  type Question,
  type Recommendation,
} from '../../types/session'
import { areaNames, claimArea, independentSourceIds, normalized } from '../onboarding/lifeAreas'
import { evaluateTool, domainNames } from './evaluator'

const supportedSignals = (memory: Memory) => [
  ...memory.confirmedFacts,
  ...memory.goals,
  ...memory.interests,
]
const signalsFor = (opportunity: Opportunity, memory: Memory, history: Interaction[]) => {
  const independent = independentSourceIds(history)
  return supportedSignals(memory).filter(
    (c) =>
      !c.negative &&
      independent.has(c.sourceId) &&
      claimArea(c) === opportunity.lifeArea &&
      c.domain === opportunity.domain,
  )
}

export function calculateCoverage(memory: Memory, history: Interaction[]): Coverage {
  const independent = independentSourceIds(history)
  const byArea = new Map<Coverage['areas'][number]['lifeArea'], string[]>()
  for (const h of history) {
    if (!independent.has(h.id) || ['constraints', 'familiarity'].includes(h.question.targetGap))
      continue
    const signals = supportedSignals(memory).filter((c) => c.sourceId === h.id && !c.negative)
    if (!signals.length) continue
    // One answer is one independent probe, even when it contains several technical topics.
    const area =
      signals.find((c) => claimArea(c) === h.question.lifeArea)?.lifeArea ?? claimArea(signals[0])
    byArea.set(area, [...(byArea.get(area) ?? []), h.id])
  }
  const areas = [...byArea].map(([lifeArea, sourceIds]) => ({ lifeArea, sourceIds }))
  return {
    areas,
    independentAreas: areas.length,
    score: Math.round((100 * areas.length) / lifeAreas.length),
  }
}

export function calculateRRS(
  opportunity: Opportunity,
  memory: Memory,
  history: Interaction[],
): number {
  const signals = signalsFor(opportunity, memory, history)
  const sources = new Set(signals.map((c) => c.sourceId))
  const conflict = memory.contradictions.some(
    (c) => c.domain === opportunity.domain && (!c.lifeArea || c.lifeArea === opportunity.lifeArea),
  )
  if (
    conflict ||
    supportedSignals(memory).some(
      (c) => c.negative && c.domain === opportunity.domain && claimArea(c) === opportunity.lifeArea,
    )
  )
    return 0
  // Uncalibrated prototype points: sources 40, distinct signals 20, specificity 15,
  // independently explored breadth 15, answered practical constraints 10.
  return (
    Math.min(40, sources.size * 20) +
    Math.min(20, new Set(signals.map((c) => normalized(c.quote))).size * 10) +
    (signals.some((c) => c.kind === 'goal' || c.kind === 'interest')
      ? 15
      : signals.length
        ? 5
        : 0) +
    (signals.length && calculateCoverage(memory, history).independentAreas >= 2 ? 15 : 0) +
    (signals.length && history.some((h) => h.question.targetGap === 'constraints' && !h.skipped)
      ? 10
      : 0)
  )
}

export function updateHypotheses(memory: Memory, history: Interaction[]): DiscoveryHypothesis[] {
  const derived = opportunities.map((opportunity) => {
    const signals = signalsFor(opportunity, memory, history)
    const sourceIds = [...new Set(signals.map((c) => c.sourceId))]
    const contradicted = supportedSignals(memory).some(
      (c) => c.negative && c.domain === opportunity.domain && claimArea(c) === opportunity.lifeArea,
    )
    const score = calculateRRS(opportunity, memory, history)
    return {
      id: opportunity.id,
      text: opportunity.title,
      domain: opportunity.domain,
      lifeArea: opportunity.lifeArea,
      sourceIds,
      confidence: contradicted ? 0 : score / 100,
      status: contradicted
        ? 'contradicted'
        : sourceIds.length >= 2 && score >= 75
          ? 'supported'
          : 'tentative',
    } satisfies DiscoveryHypothesis
  })

  const proposed: DiscoveryHypothesis[] = memory.hypotheses.map((h, index) => {
    const lifeArea = claimArea(h)
    const contradicted = supportedSignals(memory).some(
      (c) => c.negative && c.domain === h.domain && claimArea(c) === lifeArea,
    )
    return {
      id: `proposal-${lifeArea}-${h.domain}-${index}`,
      text: h.text,
      domain: h.domain,
      lifeArea,
      sourceIds: [h.sourceId],
      confidence: contradicted ? 0 : 0.25,
      status: contradicted ? 'contradicted' : 'tentative',
    }
  })
  return [...derived, ...proposed].sort((a, b) => b.confidence - a.confidence).slice(0, 8)
}

export function estimateEIG(question: Question, memory: Memory, history: Interaction[]): number {
  const title = normalized(question.title)
  if (history.some((h) => normalized(h.question.title) === title)) return -1000
  const used = history.filter(
    (h) => h.question.targetGap === question.targetGap && h.question.lifeArea === question.lifeArea,
  )
  if (used.length >= 2) return -1000
  if (['constraints', 'familiarity'].includes(question.targetGap) && used.length) return -1000
  const coverage = calculateCoverage(memory, history)
  const area = question.lifeArea
  const sources = coverage.areas.find((a) => a.lifeArea === area)?.sourceIds.length ?? 0
  const independent = independentSourceIds(history)
  const targetSources = new Set(
    supportedSignals(memory)
      .filter(
        (c) =>
          !c.negative &&
          claimArea(c) === area &&
          c.domain === question.targetGap &&
          independent.has(c.sourceId),
      )
      .map((c) => c.sourceId),
  ).size
  // Approximate value, not entropy: exploration, validation, contradiction resolution,
  // practical information and format variety, minus repetition and answer effort.
  return (
    (area && !sources ? (coverage.independentAreas < 2 ? 45 : 15) : 0) +
    (sources === 1 || targetSources === 1 ? 25 : 0) +
    (memory.contradictions.some(
      (c) => c.domain === question.targetGap && (!c.lifeArea || c.lifeArea === area),
    )
      ? 35
      : 0) +
    (question.targetGap === 'constraints' ? 50 : question.targetGap === 'familiarity' ? 10 : 0) +
    (!history.some((h) => h.question.component === question.component) ? 10 : 0) -
    used.length * 15 -
    (area && history.at(-1)?.question.lifeArea === area && targetSources >= 2 ? 20 : 0) -
    (question.component === 'VoiceTextQuestion' ? 8 : 1)
  )
}

function areaMemory(memory: Memory, area: Opportunity['lifeArea']): Memory {
  const filter = (claims: Claim[]) => claims.filter((c) => claimArea(c) === area)
  return {
    ...memory,
    confirmedFacts: filter(memory.confirmedFacts),
    goals: filter(memory.goals),
    interests: filter(memory.interests),
    contradictions: memory.contradictions.filter((c) => !c.lifeArea || c.lifeArea === area),
  }
}

export function buildRecommendations(
  memory: Memory,
  history: Interaction[],
  external = false,
): Recommendation[] {
  const coverage = calculateCoverage(memory, history)
  const available = [...opportunities]
  if (external) {
    // A source-backed opportunity may concern data, presentations or another domain
    // absent from the small demo catalog. Its scope still needs actual cited evidence.
    for (const signal of supportedSignals(memory).filter((c) => !c.negative)) {
      const area = claimArea(signal)
      if (available.some((o) => o.lifeArea === area && o.domain === signal.domain)) continue
      available.push({
        id: `external:${area}:${signal.domain}`,
        lifeArea: area,
        domain: signal.domain,
        title: `Попробовать AI для ${domainNames[signal.domain]} в сфере ${areaNames[area]}`,
        toolIds: [],
        workflow: [],
      })
    }
  }
  const candidates = available
    .flatMap((opportunity) => {
      const scoped = areaMemory(memory, opportunity.lifeArea)
      if (supportedSignals(scoped).some((c) => c.negative && c.domain === opportunity.domain))
        return []
      const compatible = opportunity.toolIds
        .flatMap((id) => {
          const tool = verifiedCatalog.find(
            (t) => t.id === id && t.supportedUseCases.includes(opportunity.domain),
          )
          if (!tool) return []
          const result = evaluateTool(tool, scoped, history)
          return result ? [result] : []
        })
        .sort((a, b) => b.score - a.score)
      // External selection starts from the person's opportunities, not the desktop demo catalog.
      const tool = external ? { toolId: 'pending', exploratory: false } : compatible[0]
      if (!tool) return []
      const signals = signalsFor(opportunity, memory, history)
      const sourceIds = [...new Set(signals.map((c) => c.sourceId))]
      const score = calculateRRS(opportunity, memory, history)
      return [
        {
          ...tool,
          opportunityId: opportunity.id,
          lifeArea: opportunity.lifeArea,
          opportunity: opportunity.title,
          score,
          exploratory:
            sourceIds.length < 2 || score < 75 || coverage.independentAreas < 2 || tool.exploratory,
          sourceIds,
          evidenceQuotes: signals.slice(0, 3).map((c) => c.quote),
          workflow: opportunity.workflow,
          firstAction: opportunity.workflow[0] ?? 'Выберите небольшой пример для пробы.',
          why: signals.length
            ? `Вы рассказали: «${signals[0].quote}». Это повод попробовать сценарий для ${areaNames[opportunity.lifeArea]}.`
            : 'Для этого сценария пока мало сведений. Это осторожная идея для пробы, а не вывод о вашей потребности.',
        } satisfies Recommendation,
      ]
    })
    .sort((a, b) => b.score - a.score || a.opportunityId!.localeCompare(b.opportunityId!))
  const selected: Recommendation[] = []
  for (const item of candidates.filter((r) => r.sourceIds.length)) {
    if (selected.some((r) => r.lifeArea === item.lifeArea)) continue
    selected.push(item)
    if (selected.length === 3) break
  }
  // Do not pad two evidenced discoveries with an unrelated third. With insufficient
  // evidence, offer up to two clearly exploratory ideas from compatible local tools.
  for (const item of candidates) {
    if (selected.length >= 2) break
    if (!selected.some((r) => r.lifeArea === item.lifeArea)) selected.push(item)
  }
  return selected
}

export function shouldFinishDiscovery(
  memory: Memory,
  history: Interaction[],
  recommendations: Recommendation[],
  nextEIG: number,
): boolean {
  if (history.length >= MAX_STEPS) return true
  if (
    history.length < 5 ||
    calculateCoverage(memory, history).independentAreas < 2 ||
    memory.contradictions.length
  )
    return false
  if (!history.some((h) => h.question.targetGap === 'constraints' && !h.skipped)) return false
  return recommendations.filter((r) => !r.exploratory).length >= 2 && nextEIG < 45
}
