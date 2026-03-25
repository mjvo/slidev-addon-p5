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

  const clicked = await clickRunButton(page)
  if (!clicked) throw new Error('No Run button found on external-p5-libs smoke slide')

  const iframeHandle = await page.waitForSelector('iframe.p5-canvas-iframe:visible', { timeout: 20_000 })
  expect(iframeHandle).toBeTruthy()
  const sketchId = await iframeHandle.getAttribute('data-p5code-id')
  await waitForP5IframeReady(page, sketchId, 20_000)

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
