import { expect, test } from '@playwright/test'

test('invalid class edits remain editable and do not overwrite the valid model', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '编辑类 Student' }).click()
  await page.getByLabel('类名', { exact: true }).fill('')
  await page.getByRole('button', { name: '应用更改' }).click()
  await expect(page.locator('.inspector-error')).toBeVisible()
  await expect(page.getByLabel('类名', { exact: true })).toHaveValue('')
  await expect(page.getByRole('textbox', { name: 'PlantUML source' })).toHaveValue(/class Student/)
  await page.getByRole('button', { name: '撤销编辑' }).click()
  await expect(page.getByLabel('类名', { exact: true })).toHaveValue('Student')
})

test('dragged class position is persisted across reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const item = page.getByRole('button', { name: '编辑类 Student' })
  const initial = await item.getAttribute('transform')
  const box = (await item.boundingBox())!
  await page.mouse.move(box.x + 30, box.y + 15)
  await page.mouse.down()
  await page.mouse.move(box.x + 110, box.y + 65, { steps: 5 })
  await page.mouse.up()
  const moved = await item.getAttribute('transform')
  expect(moved).not.toBe(initial)
  await page.reload()
  await expect(item).toHaveAttribute('transform', moved!)
})

test('corrupted saved document is not overwritten', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('uml-oj-canvas-document-v1', '{corrupt'))
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('无法恢复')
  await page.getByRole('textbox', { name: 'PlantUML source' }).fill('@startuml\nclass NewDraft\n@enduml')
  await expect(page.locator('footer')).toContainText('已同步')
  expect(await page.evaluate(() => localStorage.getItem('uml-oj-canvas-document-v1'))).toBe('{corrupt')
})
