import { expect, test } from '@playwright/test'

test('class hover previews a dashed outline and clicking focuses the class without selecting text', async ({ page }) => {
  await page.goto('/')
  const student = page.getByRole('button', { name: '编辑类 Student' })
  const classroom = page.getByRole('button', { name: '编辑类 Classroom' })
  const outline = student.locator('.node-outline')

  await expect(student).toHaveAttribute('aria-pressed', 'false')
  await expect(outline).toHaveCSS('opacity', '0')
  await student.hover()
  await expect(outline).toHaveCSS('opacity', '1')
  await expect(outline).toHaveCSS('stroke-dasharray', '5px, 4px')
  await expect(student).toHaveAttribute('aria-pressed', 'false')
  await page.locator('.pane-header').first().hover()
  await expect(outline).toHaveCSS('opacity', '0')

  // Click directly on the visible class title, not just the empty rectangle.
  const title = student.locator('.node-title')
  const box = (await title.boundingBox())!
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  await expect(student).toHaveAttribute('aria-pressed', 'true')
  await expect(student).toBeFocused()
  await expect(outline).toHaveCSS('opacity', '1')
  await expect(outline).toHaveCSS('stroke-dasharray', 'none')
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('')
  await expect(page.getByLabel('类名', { exact: true })).toHaveValue('Student')

  await classroom.click()
  await expect(classroom).toHaveAttribute('aria-pressed', 'true')
  await expect(student).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByLabel('类名', { exact: true })).toHaveValue('Classroom')
})
