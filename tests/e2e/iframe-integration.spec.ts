import { test, expect } from '@playwright/test'
import {
  clickRunButton,
  navigateToSlideContainingText,
  waitForP5CanvasInFrame,
  waitForP5IframeReady,
  waitForSlidevDeckReady,
} from './helpers'

// Target Slidev dev server via Playwright baseURL
test.setTimeout(90_000)

test('Run button creates iframe and canvas (integration)', async ({ page }) => {
  await page.goto('/')
  // Wait for Slidev content and Run controls to be available before interacting
  await waitForSlidevDeckReady(page)
  await page.waitForFunction(() => {
    return !!(document.querySelector('button[title="Run code"]') || document.querySelector('[data-p5code-id]'))
  }, { timeout: 20_000 })
  await page.click('body')
  await navigateToSlideContainingText(page, 'instantiate the sketch in the iframe on the right')

  const activeSlide = page.locator(".slidev-page:not([style*='display: none'])").filter({
    has: page.locator('button[title="Run code"]'),
  }).first()
  await expect(activeSlide).toBeVisible({ timeout: 10_000 })

  const runButton = activeSlide.locator('button[title="Run code"]').first()
  await expect(runButton).toBeVisible({ timeout: 10_000 })
  const sketchId = await runButton.evaluate((button) => {
    return button.closest('[data-p5code-id]')?.getAttribute('data-p5code-id') || button.getAttribute('data-p5code-id')
  })

  const clicked = await clickRunButton(page, sketchId)
  if (!clicked) {
    throw new Error('No Run button found on the first interactive P5Code slide')
  }

  const iframeHandle = sketchId
    ? await activeSlide.locator(`iframe.p5-canvas-iframe[data-p5code-id="${sketchId}"]`).first().elementHandle({ timeout: 20_000 })
    : await activeSlide.locator('iframe.p5-canvas-iframe').first().elementHandle({ timeout: 20_000 })
  expect(iframeHandle).toBeTruthy()

  const effectiveSketchId = await iframeHandle!.getAttribute('data-p5code-id')
  if (effectiveSketchId) {
    await waitForP5IframeReady(page, effectiveSketchId, 20_000)
  }

  const frame = await iframeHandle!.contentFrame()
  expect(frame).toBeTruthy()
  const canvas = await waitForP5CanvasInFrame(frame!, 60_000)
  expect(canvas).toBeTruthy()
  const box = await canvas!.boundingBox()
  expect(box && box.width > 0 && box.height > 0).toBeTruthy()
})
