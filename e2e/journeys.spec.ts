import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
async function start(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Найти свои возможности' }).click()
  await expect(page.getByRole('textbox', { name: 'Ваш ответ' })).toBeVisible()
}
async function advance(page: Page, name: string) {
  const id = await page.locator('[data-question-id]').getAttribute('data-question-id')
  await page.getByRole('button', { name, exact: true }).click()
  await expect(
    page.locator(`[data-question-id]:not([data-question-id="${id}"]),.results-intro,.error-state`),
  ).toBeVisible()
}
async function answer(page: Page, text: string) {
  await page.getByRole('textbox').fill(text)
  await advance(page, 'Продолжить')
}
async function finish(page: Page, response: string) {
  for (let i = 0; i < 8; i++) {
    if (await page.getByRole('heading', { name: 'Ваши AI-открытия.' }).isVisible()) return
    await expect(page.getByRole('progressbar')).toBeVisible()
    await expect(page.locator('.loading-state')).toHaveCount(0)
    if (await page.getByRole('textbox').isVisible()) {
      await answer(page, response)
      continue
    }
    if (await page.getByRole('button', { name: /Могу установить приложение/ }).isVisible()) {
      await page.getByRole('button', { name: /Могу установить приложение/ }).click()
      await advance(page, 'Продолжить')
      continue
    }
    await advance(page, 'Пропустить')
  }
  await expect(page.getByRole('heading', { name: 'Ваши AI-открытия.' })).toBeVisible()
}
test('student end-to-end: evidence, official links, restart and no browser persistence', async ({
  page,
}) => {
  const text =
    'Я студент. Читаю исследовательские статьи и документы. Хочу понятные ответы по источникам.'
  await start(page)
  await page.getByRole('button', { name: /Учусь и исследую/ }).click()
  await expect(page.getByRole('textbox')).toHaveValue(/Я студент/)
  await answer(page, text)
  await expect(page.getByRole('heading', { name: /Вы упомянули/ })).toBeVisible()
  await finish(page, text)
  await expect(page.locator('.recommendation-card')).toHaveCount(3)
  await expect(page.locator('main')).toHaveCSS('opacity', '1')
  expect(
    (
      await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    ).violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })),
  ).toEqual([])
  await expect(page.getByRole('link', { name: /Попробовать инструмент/ }).first()).toHaveAttribute(
    'href',
    /^https:\/\//,
  )
  await expect(page.locator('.recommendation-why').first()).toContainText('Вы рассказали')
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 })
  await page.getByRole('button', { name: 'Начать заново', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Откройте, что AI/ })).toBeVisible()
})
test('creative journey, change earlier answer and no horizontal overflow', async ({ page }) => {
  await start(page)
  await answer(page, 'Я фотограф. Улучшаю изображения и видео.')
  await expect(page.getByRole('heading', { name: /фотограф/ })).toBeVisible()
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(page.getByRole('textbox')).toHaveValue('Я фотограф. Улучшаю изображения и видео.')
  await answer(page, 'Хочу улучшать фотографии и изображения.')
  await finish(page, 'Фотографии и изображения требуют много обработки.')
  await expect(page.getByRole('heading', { name: 'Upscayl', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})
test('skipped and vague answers terminate honestly', async ({ page }) => {
  await start(page)
  await advance(page, 'Пропустить')
  await finish(page, 'Не знаю')
  await expect(page.locator('.fit-label').first()).toHaveText('Идея для пробы')
})
test('network failure is recoverable and preserves the answer', async ({ page }) => {
  await start(page)
  await page.route('**/api/onboarding/next', (route) => route.fulfill({ status: 502, body: '{}' }))
  await answer(page, 'Читаю документы')
  await expect(page.getByRole('heading', { name: 'Не получилось продолжить.' })).toBeVisible()
  await page.getByRole('button', { name: 'Вернуться к ответу' }).click()
  await expect(page.getByRole('textbox')).toHaveValue('Читаю документы')
  await page.unroute('**/api/onboarding/next')
  await answer(page, 'Читаю документы')
  await expect(page.getByRole('heading', { name: /Вы упомянули/ })).toBeVisible()
})
test('gallery previews every fixed interaction without API calls', async ({ page }) => {
  let apiCalls = 0
  page.on('request', (r) => {
    if (r.url().includes('/api/onboarding/next')) apiCalls++
  })
  await page.goto('/#gallery')
  await expect(page.getByRole('heading', { name: 'Библиотека взаимодействий' })).toBeVisible()
  for (const name of [
    'VoiceTextQuestion',
    'ChoiceCards',
    'ThisOrThat',
    'SwipeCards',
    'AppRecognition',
    'ScenarioGame',
  ]) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.locator('.question-panel')).toBeVisible()
  }
  expect(apiCalls).toBe(0)
})

for (const [name, response] of [
  [
    'office',
    'Работаю в офисе. Хочу расшифровывать аудио встреч и упорядочить документы и заметки.',
  ],
  ['everyday', 'Я не знаком с AI. Хочу писать тексты и разбираться в повседневных вопросах.'],
]) {
  test(`${name} persona completes with grounded or explicitly exploratory discoveries`, async ({
    page,
  }) => {
    await start(page)
    await answer(page, response)
    await finish(page, response)
    await expect(page.locator('.recommendation-card').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Начать заново', exact: true })).toBeVisible()
  })
}
