// Functional HTTP validation against a running development or preview server; no paid calls.
import assert from 'node:assert/strict'
import tools from '../src/data/tools.json' with { type: 'json' }
const origin = process.env.COMPASS_TEST_ORIGIN || 'http://127.0.0.1:5173'
assert.equal((await fetch(`${origin}/api/status`).then((r) => r.json())).demo, true)
const intro = {
  id: 'intro',
  component: 'VoiceTextQuestion',
  title: 'Расскажите немного о себе.',
  description: 'Чем вы занимаетесь и что вам интересно? Достаточно пары фраз.',
  options: [],
  multiple: false,
  targetGap: 'introduction',
}
const rejected = await fetch(`${origin}/api/onboarding/next`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'demo',
    history: [{ id: 'step-1', question: intro, answer: '', skipped: true }],
  }),
})
assert.equal(rejected.status, 400)
for (const name of ['student', 'creative', 'office', 'everyday', 'skipped']) {
  const history = []
  let question = intro,
    result
  for (let step = 0; step < 7; step++) {
    const intros = {
      student: 'Я студент, читаю исследовательские статьи и документы',
      creative: 'Я фотограф, люблю снимать фотографии и видео',
      office: 'Работаю в офисе с документами, участвую во встречах',
      everyday: 'Люблю путешествовать и писать тексты о повседневной жизни',
      skipped: 'Пока не знаю',
    }
    const answer =
      step === 0
        ? intros[name]
        : name === 'skipped'
          ? ''
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
  assert.equal(history[0].question.component, 'VoiceTextQuestion')
  assert.ok(history.slice(1).every((h) => h.question.component !== 'VoiceTextQuestion'))
  assert.ok(new Set(history.map((h) => h.question.component)).size >= 3)
  for (const r of result.recommendations) {
    assert.ok(tools.some((t) => t.id === r.toolId && t.verificationStatus === 'verified'))
    for (const quote of r.evidenceQuotes) assert.ok(history.some((h) => h.answer.includes(quote)))
    if (name === 'skipped') assert.equal(r.exploratory, true)
  }
  console.log(
    `${name}: ${history.length} steps, ${new Set(history.map((h) => h.question.component)).size} formats, ${result.recommendations.length} discoveries; required open intro, then adaptive interactions`,
  )
}
