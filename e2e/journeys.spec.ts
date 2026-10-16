import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Locator } from '@playwright/test'
async function start(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Найти свои возможности' }).click()
  await expect(page.getByRole('heading', { name: 'С чего начнём?' })).toBeVisible()
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
}
async function select(page: Page, button: Locator) {
  const id = await page.locator('[data-question-id]').getAttribute('data-question-id')
  await button.click()
  await expect(
    page.locator(`[data-question-id]:not([data-question-id="${id}"]),.results-intro,.error-state`),
  ).toBeVisible()
}
async function advance(page: Page, name: string, exact = true) {
  await select(page, page.getByRole('button', { name, exact }))
}

async function write(page: Page, text: string) {
  if (!(await page.getByRole('textbox').isVisible()))
    await page.getByRole('button', { name: 'Ответить своими словами' }).click()
  await page.getByRole('textbox').fill(text)
  await advance(page, 'Продолжить')
}
async function reactToSwipe(page: Page, interested = true) {
  const id = await page.locator('[data-question-id]').getAttribute('data-question-id')
  const text = await page.locator('.swipe-card strong').textContent()
  await page
    .getByRole('button', { name: interested ? 'Интересно' : 'Пока нет', exact: true })
    .click()
  await expect(async () => {
    const nextId = await page.locator('[data-question-id]').getAttribute('data-question-id')
    if (nextId !== id) return
    expect(await page.locator('.swipe-card strong').textContent({ timeout: 100 })).not.toBe(text)
  }).toPass({ timeout: 5000 })
}
async function finish(page: Page) {
  for (let i = 0; i < 7; i++) {
    if (await page.getByRole('heading', { name: 'Ваши AI-открытия.' }).isVisible()) return
    await expect(page.locator('[data-question-id]')).toBeVisible()
    if (await page.locator('.swipe-card').isVisible()) {
      for (let j = 0; j < 3 && (await page.locator('.swipe-card').isVisible()); j++)
        await reactToSwipe(page)
    } else if (
      await page
        .getByRole('button', { name: 'Могу установить приложение на компьютер', exact: true })
        .isVisible()
    )
      await advance(page, 'Могу установить приложение на компьютер')
    else if (await page.locator('.scenario-option').first().isVisible())
      await select(page, page.locator('.scenario-option').first())
    else if (await page.locator('.comparison-card').first().isVisible()) {
      await select(page, page.locator('.comparison-card').first())
    } else await advance(page, 'Пропустить')
  }
  await expect(page.getByRole('heading', { name: 'Ваши AI-открытия.' })).toBeVisible()
}
test('student can finish with choices and early swipes, without typing', async ({ page }) => {
  await start(page)
  await advance(page, 'Учёба и исследования Статьи, документы, новые знания')
  await expect(page.locator('.scenario-options')).toBeVisible()
  await select(page, page.getByRole('button', { name: /Быстро понять документ/ }))
  await expect(page.locator('.swipe-card')).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await finish(page)
  await expect(page.locator('.recommendation-card')).toHaveCount(3)
  await expect(page.locator('main')).toHaveCSS('opacity', '1')
  expect(
    (
      await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    ).violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })),
  ).toEqual([])
  await expect(page.locator('.recommendation-why').first()).toContainText('Вы рассказали')
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 })
  await page.getByRole('button', { name: 'Начать заново', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Откройте, что AI/ })).toBeVisible()
})
test('creative choices change the follow-up; Back allows a correction', async ({ page }) => {
  await start(page)
  await advance(page, 'Фотографии и видео Создавать и обрабатывать')
  await expect(page.locator('.comparison')).toBeVisible()
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'С чего начнём?' })).toBeVisible()
  await advance(page, 'Фотографии и видео Создавать и обрабатывать')
  await select(page, page.getByRole('button', { name: /Улучшать фотографии/ }))
  await finish(page)
  await expect(page.getByRole('heading', { name: 'Upscayl', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('fully skipped answers terminate with honest exploratory results', async ({ page }) => {
  await start(page)
  for (
    let i = 0;
    i < 7 && !(await page.getByRole('heading', { name: 'Ваши AI-открытия.' }).isVisible());
    i++
  )
    await advance(page, 'Пропустить')
  await expect(page.getByRole('heading', { name: 'Ваши AI-открытия.' })).toBeVisible()
  await expect(page.locator('.fit-label').first()).toHaveText('Идея для пробы')
})
test('text stays optional and an API failure is recoverable', async ({ page }) => {
  await start(page)
  await page.route('**/api/onboarding/next', (r) => r.fulfill({ status: 502, body: '{}' }))
  await write(page, 'Читаю документы')
  await expect(page.getByRole('heading', { name: 'Не получилось продолжить.' })).toBeVisible()
  await page.getByRole('button', { name: 'Вернуться к ответу' }).click()
  await expect(page.getByRole('textbox')).toHaveValue('Читаю документы')
  await page.unroute('**/api/onboarding/next')
  await write(page, 'Читаю документы')
  await expect(page.locator('.scenario-options')).toBeVisible()
})
test('time limits can be extended, disabled and stay disabled across questions', async ({
  page,
}) => {
  await start(page)
  await page.getByRole('button', { name: 'Добавить 20 секунд' }).click()
  await expect(page.getByRole('timer')).toHaveText(/00:(?:3\d|40)/)
  await page.getByRole('button', { name: 'Без таймера', exact: true }).click()
  await expect(page.getByRole('timer')).toHaveCount(0)
  await advance(page, 'Повседневные дела Писать, планировать, разбираться в новом')
  await expect(page.getByText('В своём темпе')).toBeVisible()
  await expect(page.getByRole('timer')).toHaveCount(0)
  await page.getByRole('button', { name: 'Включить таймер' }).click()
  await expect(page.getByRole('timer')).toBeVisible()
})
test('expiry keeps a written draft and permits continuing without a deadline', async ({ page }) => {
  await page.clock.install()
  await start(page)
  await page.getByRole('button', { name: 'Ответить своими словами' }).click()
  await page.getByRole('textbox').fill('Мой короткий ответ')
  await page.clock.runFor(21000)
  await expect(page.locator('.timer-nudge')).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveValue('Мой короткий ответ')
  await page.getByRole('button', { name: 'Без таймера', exact: true }).click()
  await expect(page.locator('.timer-nudge')).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveValue('Мой короткий ответ')
})
test('gallery previews all six interactions without AI requests', async ({ page }) => {
  let calls = 0
  page.on('request', (r) => {
    if (r.url().includes('/api/onboarding/next')) calls++
  })
  await page.goto('/#gallery')
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
  expect(calls).toBe(0)
})
for (const [name, choice] of [
  ['office', 'Работа и рутина Документы, встречи, повторяющиеся дела'],
  ['everyday', 'Повседневные дела Писать, планировать, разбираться в новом'],
]) {
  test(`${name} persona completes using only quick interactions`, async ({ page }) => {
    await start(page)
    await advance(page, choice)
    await finish(page)
    await expect(page.locator('.recommendation-card').first()).toBeVisible()
  })
}
