import { verifiedCatalog, type Tool } from '../../data/catalog'
import type { Domain, Interaction, Memory, Recommendation } from '../../types/session'
export const domainNames: Record<Domain, string> = {
  research: 'работы с источниками',
  data: 'работы с данными',
  writing: 'работы с текстами',
  design: 'визуальных задач',
  video: 'работы с видео',
  audio: 'работы с аудио',
  coding: 'разработки',
  productivity: 'повседневных рабочих задач',
  learning: 'учёбы',
  presentations: 'презентаций',
  communication: 'общения',
  everyday: 'повседневной жизни',
}
export function evaluateTool(
  tool: Tool,
  memory: Memory,
  history: Interaction[],
): Recommendation | null {
  const facts = [...memory.confirmedFacts, ...memory.goals, ...memory.interests].filter(
    (c) => !c.negative && tool.supportedUseCases.includes(c.domain),
  )
  const conflict = memory.contradictions.some((c) => tool.supportedUseCases.includes(c.domain))
  const negative = [...memory.confirmedFacts, ...memory.goals].some(
    (c) => c.negative && tool.supportedUseCases.includes(c.domain),
  )
  if (negative || conflict || tool.verificationStatus !== 'verified') return null
  const answers = history
    .filter((h) => !h.skipped)
    .map((h) => h.answer)
    .join(' ')
  const tech = answers
    .split(/[.;\n]/)
    .some(
      (clause) =>
        /программ|разработ|терминал|python|docker|developer|coding/i.test(clause) &&
        !/не\s+(?:\S+\s+){0,2}(?:программ|разработ|терминал|python|docker)|не умею|без техническ|not a developer|no coding/i.test(
          clause,
        ),
    )
  if (tool.requiredExperience === 'advanced' && !tech) return null
  const webOnly =
    /только\s+(?:в\s+)?(?:браузер|телефон)|без\s+установ|only\s+(?:browser|phone)|no\s+install/i.test(
      answers,
    )
  if (webOnly && !tool.supportedPlatforms.includes('web')) return null
  if (
    /только\s+(?:windows|android|linux)/i.test(answers) &&
    ['diffusionbee', 'draw-things'].includes(tool.id)
  )
    return null
  const used = memory.toolsUsed.some((c) => c.toolId === tool.id)
  const sourceIds = [...new Set(facts.map((f) => f.sourceId))]
  // Prototype heuristics, not a calibrated probability: coverage 40, reliability 35, fit 25.
  const coverage = Math.min(40, facts.length * 20)
  const reliability = sourceIds.length > 1 ? 35 : facts.length ? 26 : 0
  const fit = facts.length
    ? 25 - (used ? 12 : 0) - (tool.requiredExperience === 'intermediate' && !tech ? 10 : 0)
    : 0
  const score = coverage + reliability + fit
  const exploratory =
    sourceIds.length < 2 || score < 75 || (tool.requiredExperience === 'intermediate' && !tech)
  return {
    toolId: tool.id,
    score,
    exploratory,
    opportunity: facts.length
      ? `Новая возможность для ${domainNames[facts[0].domain]}`
      : 'Идея для первого знакомства с AI',
    why: facts.length
      ? `Вы рассказали: «${facts[0].quote}». ${tool.shortDescription}`
      : `Вы пока рассказали немного. Это пример для знакомства, а не персональный вывод. ${tool.shortDescription}`,
    firstAction: firstAction(tool),
    sourceIds,
    evidenceQuotes: facts.slice(0, 3).map((f) => f.quote),
  }
}
function firstAction(tool: Tool): string {
  if (tool.id === 'upscayl')
    return 'Возьмите небольшую фотографию и попробуйте увеличить её. Сравните детали с оригиналом.'
  if (tool.id === 'buzz' || tool.id === 'handy')
    return 'Запишите короткую несекретную фразу и сравните расшифровку с записью.'
  if (['anythingllm', 'khoj', 'open-notebook'].includes(tool.id))
    return 'Добавьте один несекретный документ и задайте вопрос по его содержанию. Проверьте ответ по источнику.'
  if (tool.category === 'writing' || tool.category === 'learning')
    return 'Попросите объяснить знакомую тему простыми словами и проверьте ответ.'
  if (tool.category === 'video')
    return 'Попробуйте обработать короткий тестовый ролик и сравните результат с оригиналом.'
  if (tool.category === 'coding')
    return 'Попросите объяснить небольшой фрагмент кода. Проверьте объяснение самостоятельно.'
  return tool.firstAction
}
export function rankTools(memory: Memory, history: Interaction[]): Recommendation[] {
  const ranked = verifiedCatalog
    .map((t) => evaluateTool(t, memory, history))
    .filter((r): r is Recommendation => !!r)
    .sort((a, b) => b.score - a.score || a.toolId.localeCompare(b.toolId))
  const selected: Recommendation[] = []
  const categories = new Set<string>()
  // Choose each slot from remaining candidates. A diversity tie-break must not discard
  // a stronger match permanently, then fill a later slot with a weaker duplicate category.
  const remaining = [...ranked]
  const category = (r: Recommendation) => verifiedCatalog.find((t) => t.id === r.toolId)!.category
  while (selected.length < 3 && remaining.length) {
    const diverse = remaining.findIndex(
      (r) => !categories.has(category(r)) && r.score >= remaining[0].score - 10,
    )
    const [next] = remaining.splice(diverse >= 0 ? diverse : 0, 1)
    selected.push(next)
    categories.add(category(next))
  }
  return selected.sort((a, b) => b.score - a.score || a.toolId.localeCompare(b.toolId))
}
