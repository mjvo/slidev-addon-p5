import { test, expect } from '@playwright/test'
import {
  clickRunButton,
  navigateToSlideContainingText,
  waitForP5CanvasInFrame,
  waitForP5IframeReady,
  waitForSlidevDeckReady,
} from './helpers'

test.setTimeout(90_000)

test('external-p5-libs loads a local iframe helper library', async ({ page }) => {
  await page.goto('/')
  await waitForSlidevDeckReady(page)
  const slideNo = await navigateToSlideContainingText(page, 'E2E external-p5-libs smoke')
  if (!slideNo) throw new Error('No slide found containing text: E2E external-p5-libs smoke')

  const activeSlide = page.locator(`.slidev-page[data-slidev-no="${slideNo}"]`).first()
  await expect(activeSlide).toBeVisible({ timeout: 10_000 })

  const runButton = activeSlide.locator('button[title="Run code"]').first()
  await expect(runButton).toBeVisible({ timeout: 10_000 })
  const sketchId = await runButton.evaluate((button) => {
    return button.closest('[data-p5code-id]')?.getAttribute('data-p5code-id') || button.getAttribute('data-p5code-id')
  })

  const clicked = await clickRunButton(page, sketchId)
  if (!clicked) throw new Error('No Run button found on external-p5-libs smoke slide')

  const iframeHandle = sketchId
    ? await page.waitForSelector(`.slidev-page[data-slidev-no="${slideNo}"] iframe.p5-canvas-iframe[data-p5code-id="${sketchId}"]`, { timeout: 20_000 })
    : await page.waitForSelector(`.slidev-page[data-slidev-no="${slideNo}"] iframe.p5-canvas-iframe`, { timeout: 20_000 })
  expect(iframeHandle).toBeTruthy()
  const effectiveSketchId = await iframeHandle.getAttribute('data-p5code-id')
  await waitForP5IframeReady(page, effectiveSketchId, 20_000)

  const frame = await iframeHandle.contentFrame()
  expect(frame).toBeTruthy()
  const canvas = await waitForP5CanvasInFrame(frame!, 20_000)
  expect(canvas).toBeTruthy()

  const helperLoaded = await frame!.evaluate(() => {
    return typeof (window as Window & {
      externalP5LibSmoke?: { drawBadge?: unknown; version?: unknown }
    }).externalP5LibSmoke?.drawBadge === 'function'
  })
  expect(helperLoaded).toBe(true)

  const helperVersion = await frame!.evaluate(() => {
    return (window as Window & {
      externalP5LibSmoke?: { version?: unknown }
    }).externalP5LibSmoke?.version
  })
  expect(helperVersion).toBe('smoke-1')
})

test('failed external-p5-libs loads surface the failed iframe dependency URL', async ({ page }) => {
  await page.goto('/')
  await waitForSlidevDeckReady(page)
  await navigateToSlideContainingText(page, 'E2E missing external-p5-lib diagnostic')

  const activeSlide = page.locator(".slidev-page:not([style*='display: none'])").filter({
    hasText: 'E2E missing external-p5-lib diagnostic',
  }).first()
  await expect(activeSlide).toBeVisible({ timeout: 10_000 })
  await expect(activeSlide.locator('.p5-error-boundary .message')).toContainText(
    'Failed to load iframe dependency script:',
    { timeout: 20_000 },
  )
  await expect(activeSlide.locator('.p5-error-boundary .message')).toContainText(
    '127.0.0.1:9/missing-external-p5-lib.js',
  )
})
