import { test, expect } from '@playwright/test'

// Allow more time for Slidev + p5 initialization across slides
test.setTimeout(60_000)

test('error UI appears when iframe reports error', async ({ page }) => {
  await page.goto('/')
  await page.click('body')
  // Wait for Slidev to render the slide content
  await page.waitForSelector('.slidev-page, .slidev-page-main, #slide-content', { timeout: 10_000 })
  // Navigate directly to the first slide that contains p5 code (avoids flaky ArrowRight navigation)
  await page.waitForFunction(() => typeof window !== 'undefined', { timeout: 10_000 })
  const targetSlideNo = await page.evaluate(() => {
    const el = document.querySelector('[data-p5code-id]') as HTMLElement | null
    return el?.closest('.slidev-page')?.getAttribute('data-slidev-no') || null
  })
  if (targetSlideNo) {
    await page.evaluate((n) => { location.href = `${location.origin}/${n}` }, targetSlideNo)
    try {
      await page.waitForSelector(`.slidev-page[data-slidev-no='${targetSlideNo}']:not([style*="display: none"])`, { timeout: 20_000 })
    } catch (e) {
      // continue — we'll search the DOM for run buttons or iframes as a fallback
    }
  }

  // Find a visible Run button within the current slide, or fall back to any run button in DOM
  const runSelector = 'button.slidev-icon-btn[title="Run code"], button[title="Run code"]'
  let chosenButton = null
  const runButtons = page.locator(runSelector)
  const count = await runButtons.count()
  if (count > 0) {
    for (let i = 0; i < count; i++) {
      const candidate = runButtons.nth(i)
      try {
        if (await candidate.isVisible()) {
          chosenButton = candidate
          break
        }
      } catch (e) {
        // ignore
      }
    }
  }
  if (!chosenButton && count > 0) chosenButton = runButtons.nth(0)

  // Use the chosen Run button (if present) and get associated p5code id
  let id: string | null = null
  if (chosenButton) {
    try {
      id = await chosenButton.getAttribute('data-p5code-id')
    } catch (e) {
      id = null
    }
  }
  // If button had no id (hidden or not associated), try to read from an iframe with data-p5code-id
  if (!id) {
    const iframeWithId = page.locator('iframe.p5-canvas-iframe[data-p5code-id]').first()
    const iframeCount = await iframeWithId.count()
    if (iframeCount > 0) {
      id = await iframeWithId.getAttribute('data-p5code-id')
    }
  }
  // Ensure the p5 canvas/container is rendered and the message handler is likely attached
  try {
    await page.waitForSelector('.p5-canvas-wrapper, iframe.p5-canvas-iframe, [data-p5code-id]', { timeout: 20_000 })
  } catch (e) {
    // continue — we'll still attempt to postMessage (handler may attach later)
  }

  // Small delay to allow component mounted handlers to attach
  await page.waitForTimeout(500)

  // Simulate an iframe reporting an error for this sketchInstanceId
  let iframeLocator = id
    ? page.locator(`iframe.p5-canvas-iframe[data-p5code-id="${id}"]`).first()
    : page.locator('iframe.p5-canvas-iframe:visible').first()
  if (await iframeLocator.count() === 0) {
    iframeLocator = page.locator('iframe.p5-canvas-iframe[data-p5code-id]').first()
  }
  if (await iframeLocator.count() === 0) {
    iframeLocator = page.locator('iframe.p5-canvas-iframe').first()
  }
  await iframeLocator.waitFor({ state: 'attached', timeout: 20_000 })
  const effectiveSketchId = id || await iframeLocator.getAttribute('data-p5code-id')
  if (!effectiveSketchId) {
    throw new Error('Unable to determine sketchInstanceId for error-ui test')
  }
  const iframeHandle = await iframeLocator.elementHandle()
  if (!iframeHandle) {
    throw new Error('Unable to resolve iframe handle for error-ui test')
  }
  const frame = await iframeHandle.contentFrame()
  if (!frame) {
    throw new Error('Unable to access iframe content frame for error-ui test')
  }
  await frame.evaluate((sketchId) => {
    window.parent.postMessage({ type: 'p5-error', sketchInstanceId: sketchId, error: 'Simulated runtime error' }, window.location.origin)
  }, effectiveSketchId)

  // Assert error UI appears (allow extra time for UI injection)
  const err = page.locator('.p5-error-boundary .message').first()
  await expect(err).toContainText('Simulated runtime error', { timeout: 20_000 })
})
