import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
test('welcome and all six interactions satisfy automated WCAG AA checks', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('main')).toHaveCSS('opacity', '1')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.getByRole('button', { name: 'Компоненты', exact: true }).click()
  for (const name of [
    'VoiceTextQuestion',
    'ChoiceCards',
    'ThisOrThat',
    'SwipeCards',
    'AppRecognition',
    'ScenarioGame',
  ]) {
    await page.getByRole('button', { name, exact: true }).click()
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(
      result.violations,
      `${name}: ${JSON.stringify(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ html: n.html, summary: n.failureSummary })) })))}`,
    ).toEqual([])
  }
})
