import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Allow more time for Slidev + p5 initialization across slides
test.setTimeout(90_000)

async function navigateToSlideContainingText(page: Page, text: string): Promise<string | null> {
  await page.waitForFunction((target) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const value = walker.currentNode.textContent || ''
      if (value.includes(target))
        return true
    }
    return false
  }, text, { timeout: 20_000 })

  const targetSlideNo = await page.evaluate((target) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const value = walker.currentNode.textContent || ''
      if (!value.includes(target))
        continue
      const el = walker.currentNode.parentElement
      const slideNo = el?.closest('.slidev-page')?.getAttribute('data-slidev-no')
      if (slideNo)
        return slideNo
    }
    return null
  }, text)

  if (!targetSlideNo)
    return null

  await page.evaluate((n) => { location.href = `${location.origin}/${n}` }, targetSlideNo)
  await page.waitForSelector(`.slidev-page[data-slidev-no='${targetSlideNo}']`, { timeout: 30_000 })
  return targetSlideNo
}

test('error UI appears when iframe reports error', async ({ page }) => {
  await page.goto('/')
  await page.click('body')
  // Wait for Slidev to render the slide content
  await page.waitForSelector('.slidev-page, .slidev-page-main, #slide-content', { timeout: 10_000 })
  // Navigate directly to the first p5 editor slide by content instead of relying on
  // visibility heuristics, which can differ between local runs and CI.
  const targetSlideNo = await navigateToSlideContainingText(
    page,
    'instantiate the sketch in the iframe on the right',
  )
  if (!targetSlideNo)
    throw new Error('Unable to locate the primary P5Code slide for error-ui test')

  const targetSlide = page.locator(`.slidev-page[data-slidev-no='${targetSlideNo}']`).first()

  // Find the visible Run button for the active p5 slide only.
  const runSelector = 'button.slidev-icon-btn[title="Run code"], button[title="Run code"]'
  let chosenButton = null
  const runButtons = targetSlide.locator(runSelector)
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
    try {
      await chosenButton.click({ force: true })
    } catch (e) {
      // Fallback to DOM click scoped to the known slide if Playwright click fails on overlap.
      await page.evaluate(({ slideNo, selector }) => {
        const slide = document.querySelector(`.slidev-page[data-slidev-no="${slideNo}"]`)
        const btn = slide?.querySelector(selector) as HTMLButtonElement | null
        btn?.click()
      }, { slideNo: targetSlideNo, selector: runSelector })
    }
  }
  // If button had no id (hidden or not associated), try to read from an iframe with data-p5code-id
  if (!id) {
    const iframeWithId = targetSlide.locator('iframe.p5-canvas-iframe[data-p5code-id]').first()
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
  // Explicitly wait for iframe creation; CI runners can be slower here.
  try {
    await page.waitForFunction(
      (slideNo) => !!document.querySelector(`.slidev-page[data-slidev-no="${slideNo}"] iframe.p5-canvas-iframe`),
      targetSlideNo,
      { timeout: 30_000 }
    )
  } catch (e) {
    // continue to locator fallback below
  }

  // Simulate an iframe reporting an error for this sketchInstanceId
  let iframeLocator = id
    ? targetSlide.locator(`iframe.p5-canvas-iframe[data-p5code-id="${id}"]`).first()
    : targetSlide.locator('iframe.p5-canvas-iframe').first()
  if (await iframeLocator.count() === 0) {
    iframeLocator = targetSlide.locator('iframe.p5-canvas-iframe[data-p5code-id]').first()
  }
  if (await iframeLocator.count() === 0) {
    iframeLocator = targetSlide.locator('iframe.p5-canvas-iframe').first()
  }
  await iframeLocator.waitFor({ state: 'attached', timeout: 30_000 })
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
    const parentOrigin = (() => {
      try {
        if (document.referrer) return new URL(document.referrer).origin
      } catch (e) {
        void e
      }
      return '*'
    })()
    window.parent.postMessage({ type: 'p5-error', sketchInstanceId: sketchId, error: 'Simulated runtime error' }, parentOrigin)
  }, effectiveSketchId)

  // Assert error UI appears (allow extra time for UI injection)
  const err = targetSlide.locator('.p5-error-boundary .message').first()
  await expect(err).toContainText('Simulated runtime error', { timeout: 20_000 })
})
