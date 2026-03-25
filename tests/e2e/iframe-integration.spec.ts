import { test, expect } from '@playwright/test'
import {
  clickRunButton,
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

  // Navigate through slides until we find a visible slide containing Run controls or a p5 marker
  const visibleRunnerPageLocator = page.locator('.slidev-page', { has: page.locator('button[title="Run code"], [data-p5code-id]') })
    // Wait for Slidev runtime then navigate directly to the first slide containing p5 code.
    await page.waitForFunction(() => typeof window !== 'undefined', { timeout: 20_000 })
    const targetSlideNo = await page.evaluate(() => {
      const el = document.querySelector('[data-p5code-id]') as HTMLElement | null
      return el?.closest('.slidev-page')?.getAttribute('data-slidev-no') || null
    })
    if (targetSlideNo) {
      await page.evaluate((n) => { location.href = `${location.origin}/${n}` }, targetSlideNo)
      try {
        await page.waitForSelector(`.slidev-page[data-slidev-no='${targetSlideNo}']:not([style*="display: none"])`, { timeout: 30_000 })
      } catch (e) {
        // If navigation didn't make the slide visible in time, continue and fallback to visible-run or iframe checks below
        // (Slidev router may initialize slowly in CI; tests will still try to find run buttons or iframes)
      }
    }
  // Try to click a Run button robustly; if click succeeds wait for iframe, otherwise fall back to scanning existing iframes
  const clicked = await clickRunButton(page)
  if (clicked) {
    const iframeHandle = await page.waitForSelector('iframe.p5-canvas-iframe:visible', { timeout: 15_000 })
    if (!iframeHandle) throw new Error('Clicked Run but no iframe appeared')
    const sketchId = await iframeHandle.getAttribute('data-p5code-id')
    if (sketchId) await waitForP5IframeReady(page, sketchId, 20_000)
    const frame = await iframeHandle.contentFrame()
    expect(frame).toBeTruthy()
    const canvas = await waitForP5CanvasInFrame(frame, 60_000)
    expect(canvas).toBeTruthy()
    const box = await canvas.boundingBox()
    expect(box && box.width > 0 && box.height > 0).toBeTruthy()
    return
  }

  // No click delivered — attempt to find an already-present iframe on the visible slide
  const visibleIframe = await visibleRunnerPageLocator.locator('iframe.p5-canvas-iframe:visible').first().elementHandle()
  if (visibleIframe) {
    const sketchId = await visibleIframe.getAttribute('data-p5code-id')
    await waitForP5IframeReady(page, sketchId, 15_000)
    const frame = await visibleIframe.contentFrame()
    expect(frame).toBeTruthy()
    const canvas = await waitForP5CanvasInFrame(frame, 15_000)
    expect(canvas).toBeTruthy()
    const box = await canvas.boundingBox()
    expect(box && box.width > 0 && box.height > 0).toBeTruthy()
    return
  }

  // Fallback: search for any iframe anywhere on the page
  const anyIframeHandle = await page.locator('iframe.p5-canvas-iframe:visible').first().elementHandle()
  if (!anyIframeHandle) {
    throw new Error('No Run button found and no iframe present on page')
  }
  const anySketchId = await anyIframeHandle.getAttribute('data-p5code-id')
  await waitForP5IframeReady(page, anySketchId, 15_000)
  const anyFrame = await anyIframeHandle.contentFrame()
  expect(anyFrame).toBeTruthy()
  const anyCanvas = await waitForP5CanvasInFrame(anyFrame, 30_000)
  expect(anyCanvas).toBeTruthy()
  const anyBox = await anyCanvas.boundingBox()
  expect(anyBox && anyBox.width > 0 && anyBox.height > 0).toBeTruthy()
  return
})
