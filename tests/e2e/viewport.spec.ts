import { expect, test } from '@playwright/test'

const readView = async (page: import('@playwright/test').Page) => (await page.getByLabel('类图画布').getAttribute('viewBox'))!.split(' ').map(Number)

test('pan, zoom, fit and keyboard navigation do not modify the model or staged edits', async ({ page }) => {
  await page.goto('/')
  const svg = page.getByLabel('类图画布')
  const source = page.getByLabel('PlantUML source')
  const original = await source.inputValue()
  const originalPosition = await page.getByRole('button', { name: '编辑类 Student' }).getAttribute('transform')
  await page.getByRole('button', { name: '编辑类 Student' }).click()
  await page.getByLabel('类名', { exact: true }).fill('PendingStudent')
  await page.getByRole('button', { name: '放大画布' }).click()
  await expect(page.getByLabel('画布缩放比例')).toHaveText('120%')
  await expect(page.getByLabel('类名', { exact: true })).toHaveValue('PendingStudent')
  await expect(source).toHaveValue(original)
  await expect(page.getByRole('button', { name: '编辑类 Student' })).toHaveAttribute('transform', originalPosition!)
  await page.getByRole('button', { name: '撤销编辑' }).click()
  await page.getByRole('button', { name: '关闭编辑面板' }).click()

  const box = (await svg.boundingBox())!
  const px = box.x + box.width * .85, py = box.y + box.height * .8
  const before = await readView(page)
  await page.mouse.move(px, py)
  await page.mouse.down()
  await page.mouse.move(px - 50, py - 30, { steps: 4 })
  await page.mouse.up()
  const after = await readView(page)
  expect(after[0]).toBeGreaterThan(before[0])
  expect(after[1]).toBeGreaterThan(before[1])
  await expect(source).toHaveValue(original)

  // Zoom is anchored at the pointer, rather than jumping to the canvas centre.
  const toWorld = () => svg.evaluate((el, point) => {
    const result = new DOMPoint(point.x, point.y).matrixTransform((el as SVGSVGElement).getScreenCTM()!.inverse())
    return { x: result.x, y: result.y }
  }, { x: px, y: py })
  const anchor = await toWorld()
  await page.mouse.move(px, py)
  await page.mouse.wheel(0, -150)
  await expect(page.getByLabel('画布缩放比例')).not.toHaveText('120%')
  const anchorAfter = await toWorld()
  expect(Math.abs(anchorAfter.x - anchor.x)).toBeLessThan(1)
  expect(Math.abs(anchorAfter.y - anchor.y)).toBeLessThan(1)
  await expect(source).toHaveValue(original)

  await page.getByRole('button', { name: '适应内容' }).click()
  const student = page.getByRole('button', { name: '编辑类 Student' })
  await expect(student).toBeInViewport()
  // Node dragging remains correct after the viewport has changed.
  const previousTransform = await student.getAttribute('transform')
  const node = (await student.boundingBox())!
  await page.mouse.move(node.x + node.width / 2, node.y + node.height / 2)
  await page.mouse.down()
  await page.mouse.move(node.x + node.width / 2 + 35, node.y + node.height / 2 + 25, { steps: 4 })
  await page.mouse.up()
  await expect(student).not.toHaveAttribute('transform', previousTransform!)
  await expect(source).toHaveValue(original)
  await page.getByRole('button', { name: '关闭编辑面板' }).click()

  await svg.focus()
  const keyView = await readView(page)
  await page.keyboard.press('ArrowRight')
  expect((await readView(page))[0]).toBeGreaterThan(keyView[0])
  await page.keyboard.press('+')
  await page.keyboard.press('0')
  const resetView = await readView(page)
  expect(resetView.slice(0, 2)).toEqual([0, 0])
  await expect(page.getByLabel('画布缩放比例')).toHaveText('100%')
})

test('zoom limits and fit-to-content keep a wide diagram reachable', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('PlantUML source').fill('@startuml\nclass A\nclass B\nclass C\nclass D\nclass E\nclass F\n@enduml')
  const zoomIn = page.getByRole('button', { name: '放大画布' })
  for (let i = 0; i < 8; i++) await zoomIn.click()
  await expect(page.getByLabel('画布缩放比例')).toHaveText('400%')
  await expect(zoomIn).toBeDisabled()
  const zoomOut = page.getByRole('button', { name: '缩小画布' })
  for (let i = 0; i < 21; i++) await zoomOut.click()
  await expect(page.getByLabel('画布缩放比例')).toHaveText('10%')
  await expect(zoomOut).toBeDisabled()
  await page.getByRole('button', { name: '适应内容' }).click()
  const canvas = (await page.getByLabel('类图画布').boundingBox())!
  for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) {
    const box = (await page.getByRole('button', { name: `编辑类 ${name}`, exact: true }).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(canvas.x)
    expect(box.y).toBeGreaterThanOrEqual(canvas.y)
    expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width)
    expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height)
  }
})

test('touch pinch changes zoom and mobile controls fit the screen', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const svg = page.getByLabel('类图画布')
  const box = (await svg.boundingBox())!
  const client = await context.newCDPSession(page)
  // Two simultaneous touch contacts, starting in empty canvas space.
  const x = box.x + box.width / 2, y = box.y + box.height * .8
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 40, y, id: 1 }, { x: x + 40, y, id: 2 }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 70, y, id: 1 }, { x: x + 70, y, id: 2 }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByLabel('画布缩放比例')).not.toHaveText('100%')
  await page.getByRole('button', { name: '重置视图' }).click()
  await expect(page.getByLabel('画布缩放比例')).toHaveText('100%')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
