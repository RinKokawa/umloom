import { expect, test, type Locator } from '@playwright/test'

// SVG boundingBox includes the selection stroke, which deliberately changes on focus.
// DOM geometry excludes that stroke and reflects the actual node position and size.
const rect = (element: Locator) => element.evaluate(el => {
  const { x, y, width, height } = el.getBoundingClientRect()
  return { x, y, width, height }
})

test('inspector overlays the canvas without shifting elements and protects pending edits', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const canvas = page.locator('.canvas-scroll')
  const studentBody = page.getByRole('button', { name: '编辑类 Student' }).locator('.node-body')
  const edge = page.locator('.canvas-edge .edge-line').first()
  const before = await Promise.all([rect(canvas), rect(studentBody), rect(edge)])
  await expect(page.getByRole('complementary', { name: '类属性面板' })).toHaveCount(0)
  await page.getByRole('button', { name: '编辑类 Student' }).click()
  const inspector = page.getByRole('complementary', { name: '类属性面板' })
  await expect(inspector).toBeVisible()
  await expect(inspector.getByText('属性面板', { exact: true })).toBeVisible()
  await expect.poll(() => inspector.evaluate(el => getComputedStyle(el).transform)).toBe('none')
  const canvasBox = (await canvas.boundingBox())!
  const panelBox = (await inspector.boundingBox())!
  expect(panelBox.x).toBeGreaterThan(canvasBox.x)
  expect(panelBox.x).toBeLessThan(canvasBox.x + canvasBox.width)
  expect(Math.abs(panelBox.x + panelBox.width - canvasBox.x - canvasBox.width)).toBeLessThan(2)
  expect(Math.abs(panelBox.y - canvasBox.y)).toBeLessThan(2)
  const after = await Promise.all([rect(canvas), rect(studentBody), rect(edge)])
  for (let i = 0; i < before.length; i++) {
    expect(before[i]).not.toBeNull()
    expect(after[i]).not.toBeNull()
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(before[i]![key] - after[i]![key])).toBeLessThan(0.1)
  }
  await page.getByLabel('类名', { exact: true }).fill('Learner')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: '关闭编辑面板' }).click()
  await expect(inspector).toBeVisible()
  await expect(page.getByLabel('类名', { exact: true })).toHaveValue('Learner')
  await expect(page.getByRole('textbox', { name: 'PlantUML source' })).toHaveAttribute('readonly', '')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '关闭编辑面板' }).click()
  await expect(inspector).toHaveCount(0)
  const closed = await Promise.all([rect(canvas), rect(studentBody), rect(edge)])
  for (let i = 0; i < before.length; i++) {
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(before[i]![key] - closed[i]![key])).toBeLessThan(0.1)
  }
  await expect(page.getByRole('textbox', { name: 'PlantUML source' })).toHaveValue(/class Student/)
  await expect(page.getByRole('textbox', { name: 'PlantUML source' })).not.toHaveAttribute('readonly', '')
})

test('mobile uses a right-side overlay that can be closed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const classroom = page.getByRole('button', { name: '编辑类 Classroom' })
  const before = await rect(classroom.locator('.node-body'))
  await classroom.click()
  const inspector = page.getByRole('complementary', { name: '类属性面板' })
  const workspace = page.locator('.canvas-workspace')
  await expect.poll(() => inspector.evaluate(el => getComputedStyle(el).transform)).toBe('none')
  const panelBox = (await inspector.boundingBox())!
  const workspaceBox = (await workspace.boundingBox())!
  expect(panelBox.x).toBeGreaterThan(workspaceBox.x)
  expect(Math.abs(panelBox.x + panelBox.width - workspaceBox.x - workspaceBox.width)).toBeLessThan(2)
  const after = await rect(classroom.locator('.node-body'))
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(before![key] - after![key])).toBeLessThan(0.1)
  await page.getByRole('button', { name: '关闭编辑面板' }).click()
  await expect(inspector).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
