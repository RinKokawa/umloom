import { expect, test } from '@playwright/test'

test('inspector slides in and respects reduced-motion preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  // Capture the initial transition state as Vue inserts the panel.
  const state = await page.evaluate(() => new Promise<{ transform: string; duration: string }>((resolve, reject) => {
    const timeout = window.setTimeout(() => { observer.disconnect(); reject(new Error('inspector did not enter')) }, 2000)
    const observer = new MutationObserver(() => {
      const panel = document.querySelector('.canvas-inspector.inspector-enter-active')
      if (!panel) return
      const style = getComputedStyle(panel)
      window.clearTimeout(timeout); observer.disconnect()
      resolve({ transform: style.transform, duration: style.transitionDuration })
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    document.querySelector<SVGElement>('[aria-label="编辑类 Student"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }))
  expect(state.transform).not.toBe('none')
  expect(state.duration.split(',').map(value => value.trim())).toEqual(['0.2s', '0.2s'])
  const panel = page.getByRole('complementary', { name: '类属性面板' })
  await expect.poll(() => panel.evaluate(el => getComputedStyle(el).transform)).toBe('none')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await panel.evaluate(el => el.classList.add('inspector-enter-active'))
  await expect(panel).toHaveCSS('transition-duration', '0s')
})
