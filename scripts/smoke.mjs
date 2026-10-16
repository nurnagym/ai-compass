// Functional HTTP validation against a running development or preview server; no paid calls.
import assert from 'node:assert/strict'
import tools from '../src/data/tools.json' with { type: 'json' }
const origin = process.env.COMPASS_TEST_ORIGIN || 'http://127.0.0.1:5173'
assert.equal((await fetch(`${origin}/api/status`).then((r) => r.json())).demo, true)
const intro = {
  id: 'intro',
  component: 'ChoiceCards',
  title: 'С чего начнём?',
  description: 'Что сейчас вам ближе?',
  options: [
    { id: 'student', label: 'Учёба и исследования', description: '', assetId: 'education' },
    { id: 'creative', label: 'Фотографии и видео', description: '', assetId: 'creativity' },
    { id: 'office', label: 'Работа и рутина', description: '', assetId: 'productivity' },
    { id: 'everyday', label: 'Повседневные дела', description: '', assetId: 'everyday' },
  ],
  multiple: false,
  targetGap: 'introduction',
}
for (const name of ['student', 'creative', 'office', 'everyday', 'skipped']) {
  const history = []
  let question = intro,
    result
  for (let step = 0; step < 7; step++) {
    const answer =
      name === 'skipped'
        ? ''
        : question.id === 'intro'
          ? question.options.find((o) => o.id === name).label
          : question.targetGap === 'constraints'
            ? question.options.find((o) => o.id === 'desktop').label
            : question.component === 'SwipeCards'
              ? question.options.map((o) => `Интересно: ${o.label}`).join('; ')
              : question.component === 'AppRecognition'
                ? question.options.map((o) => `Не знаком: ${o.label}`).join('; ')
                : question.options[0].label
    history.push({ id: `step-${step + 1}`, question, answer, skipped: !answer })
    const response = await fetch(`${origin}/api/onboarding/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'demo', history }),
    })
    assert.equal(response.status, 200)
    result = await response.json()
    if (!result.question) break
    question = result.question
  }
  assert.equal(result.action, 'RECOMMEND')
  assert.equal(result.question, null)
  assert.ok(result.recommendations.length <= 3)
  assert.ok(history.slice(0, 3).some((h) => h.question.component === 'SwipeCards'))
  assert.ok(history.every((h) => h.question.component !== 'VoiceTextQuestion'))
  assert.ok(new Set(history.map((h) => h.question.component)).size >= 3)
  for (const r of result.recommendations) {
    assert.ok(tools.some((t) => t.id === r.toolId && t.verificationStatus === 'verified'))
    for (const quote of r.evidenceQuotes) assert.ok(history.some((h) => h.answer.includes(quote)))
    if (name === 'skipped') assert.equal(r.exploratory, true)
  }
  console.log(
    `${name}: ${history.length} steps, ${new Set(history.map((h) => h.question.component)).size} formats, ${result.recommendations.length} discoveries; early swipes, no required typing`,
  )
}
