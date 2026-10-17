import { expect, test } from '@playwright/test'

test('external catalog and search cards retain official websites after reload', async ({
  page,
}) => {
  await page.route('**/api/status', (route) =>
    route.fulfill({ json: { aiEnabled: true, demo: true } }),
  )
  let turns = 0
  // Browser contract fixture only: no live credentials or external network requests.
  await page.route('**/api/turn', async (route) => {
    turns++
    const body = route.request().postDataJSON()
    const response = await route.fetch({
      postData: JSON.stringify({ ...body, session: { ...body.session, mode: 'demo' } }),
    })
    const payload = await response.json()
    payload.session.mode = 'live'
    payload.session.result.mode = 'live'
    if (payload.action.type === 'results') {
      payload.session.result.recommendations = payload.session.result.recommendations.map(
        (r: object, i: number) => ({
          ...r,
          toolId: `external-${i}`,
          workflow: ['Откройте пример.', 'Проверьте результат.'],
          tool: {
            id: `external-${i}`,
            name: i ? 'Search Writer' : 'Database Writer',
            officialUrl: `https://writer${i}.example/`,
            description: 'Помощник для практического сценария',
            source: i ? 'web' : 'sheet',
            sourceUrl: i
              ? `https://writer${i}.example/features`
              : 'https://docs.google.com/spreadsheets/d/test/edit',
            checkedAt: '2026-10-17T00:00:00.000Z',
            limitations: ['Проверьте условия на сайте.'],
            contextSources: [],
          },
        }),
      )
      payload.action.recommendations = payload.session.result.recommendations
    }
    await route.fulfill({ json: payload })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Включить AI', exact: true }).click()
  await page.getByRole('button', { name: 'Найти свои возможности' }).click()
  await page.getByRole('textbox').fill('Работаю с текстами')
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  for (let i = 0; i < 6; i++) {
    await expect(page.locator('[data-question-id]')).toBeVisible()
    const id = await page.locator('[data-question-id]').getAttribute('data-question-id')
    await page.getByRole('button', { name: 'Пропустить', exact: true }).click()
    await expect(
      page.locator(`[data-question-id]:not([data-question-id="${id}"]),.results-intro`),
    ).toBeVisible()
    if (await page.locator('.results-intro').isVisible()) break
  }
  await expect(page.getByRole('heading', { name: 'Ваши AI-открытия.' })).toBeVisible()
  await expect(page.locator('.recommendation-card')).toHaveCount(2)
  const links = page.getByRole('link', { name: /Попробовать инструмент/ })
  await expect(links.nth(0)).toHaveAttribute('href', 'https://writer0.example/')
  await expect(links.nth(1)).toHaveAttribute('href', 'https://writer1.example/')
  const requests = turns
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Database Writer', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Search Writer', exact: true })).toBeVisible()
  await expect(links.nth(1)).toHaveAttribute('href', 'https://writer1.example/')
  expect(turns).toBe(requests)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
