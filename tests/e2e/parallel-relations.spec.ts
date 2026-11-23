import { expect, test } from '@playwright/test'

test('parallel associations have separate curves and can be edited independently', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'PlantUML source' }).fill('@startuml\nclass Flight\nclass Airport\nFlight -- "1" Airport : departure\nFlight -- "1" Airport : arrival\n@enduml')
  const a = page.getByRole('button', { name: '编辑关联 Flight 到 Airport：departure', exact: true })
  const b = page.getByRole('button', { name: '编辑关联 Flight 到 Airport：arrival', exact: true })
  await expect(a).toBeVisible()
  await expect(b).toBeVisible()
  expect(await a.locator('.edge-line').getAttribute('d')).not.toBe(await b.locator('.edge-line').getAttribute('d'))
  await a.locator('.edge-handle').click()
  await expect(page.getByLabel('关系名称')).toHaveValue('departure')
  await b.locator('.edge-handle').click()
  await expect(page.getByLabel('关系名称')).toHaveValue('arrival')
  await page.getByLabel('源码格式').selectOption('mermaid')
  await expect(page.getByRole('textbox', { name: 'Mermaid source' })).toHaveValue(/departure[\s\S]*arrival/)
})
