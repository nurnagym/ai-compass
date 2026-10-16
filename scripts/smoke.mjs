// Functional HTTP validation against a running development or preview server.
import assert from 'node:assert/strict'
import tools from '../src/data/tools.json' with { type: 'json' }
const origin = process.env.COMPASS_TEST_ORIGIN || 'http://127.0.0.1:5173'
const status = await fetch(`${origin}/api/status`).then((r) => r.json())
assert.equal(status.demo, true)
const intro = {
  id: 'intro',
  component: 'VoiceTextQuestion',
  title: 'Расскажите немного о себе.',
  description: 'Чем вы занимаетесь?',
  options: [],
  multiple: false,
  targetGap: 'introduction',
}
const scenarios = [
  [
    'student',
    'Я студент. Читаю исследовательские статьи и документы. Хочу разобраться в источниках.',
  ],
  ['creative', 'Я фотограф. Хочу улучшать фотографии и видео.'],
  ['office', 'Работаю в офисе. Хочу расшифровывать аудио встреч и упорядочить документы.'],
  ['everyday', 'Хочу писать тексты и получать объяснения для повседневной жизни.'],
  ['skipped', ''],
]
for (const [name, answer] of scenarios) {
  const history = []
  let question = intro,
    result
  for (let step = 0; step < 7; step++) {
    const value =
      answer && question.targetGap === 'constraints'
        ? 'Могу установить приложение на компьютер'
        : answer && question.component === 'AppRecognition'
          ? question.options.map((o) => `Не знаком: ${o.label}`).join('; ')
          : answer
    history.push({ id: `step-${step + 1}`, question, answer: value, skipped: !value })
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
  for (const r of result.recommendations) {
    assert.ok(tools.some((t) => t.id === r.toolId && t.verificationStatus === 'verified'))
    for (const quote of r.evidenceQuotes) assert.ok(history.some((h) => h.answer.includes(quote)))
    if (!answer) assert.equal(r.exploratory, true)
  }
  console.log(
    `${name}: completed in ${history.length} steps; ${result.recommendations.length} catalog discoveries`,
  )
}
