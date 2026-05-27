import { expect, test } from '@playwright/test'
import { navigateToSlideContainingText, waitForP5CanvasInFrame, waitForSlidevDeckReady } from './helpers'

test.setTimeout(90_000)

test('P5Canvas starts on activation, tears down on exit, and restarts on return', async ({ page }) => {
  await page.goto('/')
  await waitForSlidevDeckReady(page)

  const slideText = 'E2E P5Canvas lifecycle smoke'
  const targetSlide = page.locator('.slidev-page').filter({ hasText: slideText }).first()
  await expect(targetSlide).toHaveCount(1)
  const iframe = targetSlide.locator('iframe.p5-canvas-iframe').first()
  await expect(iframe).toHaveCount(1)

  await page.waitForTimeout(250)
  await expect.poll(async () => {
    return iframe.evaluate((element) => {
      const frame = (element as HTMLIFrameElement).contentWindow
      return Boolean(frame?.document.getElementById('p5-container'))
    })
  }).toBe(false)

  await navigateToSlideContainingText(page, slideText)
  await expect(targetSlide).toBeVisible({ timeout: 10_000 })
  const activeFrame = await (await iframe.elementHandle())!.contentFrame()
  expect(activeFrame).toBeTruthy()
  await waitForP5CanvasInFrame(activeFrame!, 20_000)
  await expect.poll(() => page.evaluate(() => {
    return (window as Window & { __p5CanvasLifecycleStarts?: number }).__p5CanvasLifecycleStarts || 0
  })).toBe(1)

  await page.keyboard.press('ArrowRight')
  await expect(targetSlide).not.toBeVisible({ timeout: 10_000 })
  await expect.poll(() => page.evaluate(() => {
    return (window as Window & { __p5CanvasLifecycleStops?: number }).__p5CanvasLifecycleStops || 0
  })).toBe(1)
  await expect.poll(async () => {
    return iframe.evaluate((element) => {
      const frame = (element as HTMLIFrameElement).contentWindow
      return Boolean(frame?.document.getElementById('p5-container'))
    })
  }).toBe(false)

  await page.keyboard.press('ArrowLeft')
  await expect(targetSlide).toBeVisible({ timeout: 10_000 })
  await expect.poll(() => page.evaluate(() => {
    return (window as Window & { __p5CanvasLifecycleStarts?: number }).__p5CanvasLifecycleStarts || 0
  }), { timeout: 20_000 }).toBe(2)
})
