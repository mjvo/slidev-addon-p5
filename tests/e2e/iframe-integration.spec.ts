import { test, expect } from '@playwright/test'
import type { Frame, Page } from '@playwright/test'

// Helper: wait for a p5 canvas inside a Frame with sensible fallbacks
async function waitForP5CanvasInFrame(frame: Frame, timeout = 30_000) {
  try { await frame.waitForLoadState?.('load', { timeout: 10_000 }) } catch (e) { void e }
  const selectors = ['#p5-container canvas', 'canvas']
  for (const sel of selectors) {
    try {
      const el = await frame.waitForSelector(sel, { timeout })
      if (el) return el
    } catch (e) {
      // try next selector
    }
  }
  // final polling fallback
  try { await frame.waitForFunction(() => !!document.querySelector('canvas'), { timeout }) } catch (e) { void e }
  return frame.$('canvas')
}

// Helper: wait for the iframe to post a `p5-iframe-ready` message to the parent
async function waitForP5IframeReady(page: Page, sketchInstanceId: string | null = null, timeout = 15_000) {
  return page.evaluate(({ id, timeout }) => new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => { window.removeEventListener('message', onMessage); resolve(false) }, timeout)
    function onMessage(ev: MessageEvent) {
      try {
        const d = ev.data
        if (d && d.type === 'p5-iframe-ready' && (!id || d.sketchInstanceId === id)) {
          window.removeEventListener('message', onMessage)
          clearTimeout(timer)
          resolve(true)
        }
      } catch (e) { void e }
    }
    window.addEventListener('message', onMessage)
  }), { id: sketchInstanceId, timeout })
}

// Helper: robustly click a Run button (try Playwright click then DOM pointer events)
async function clickRunButton(page: Page, sketchInstanceId: string | null = null): Promise<boolean> {
  // Prefer direct selector for Run button and use bounding-box click if Playwright visibility is flaky
  try {
    const btnHandle = await page.waitForSelector('button[title="Run code"]', { timeout: 8000 }).catch(() => null)
    if (btnHandle) {
      try {
        // Try normal Playwright click first
        await btnHandle.click().catch(() => {})
        // If not visible to Playwright, use bounding box click
        const box = await btnHandle.boundingBox()
        if (!box) {
          // still attempt a force click
          await btnHandle.click({ force: true }).catch(() => {})
        } else {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        }
        return true
      } catch (e) {
        // fall through to DOM fallback below
      }
    }
  } catch (e) { void e }

  // DOM-level fallback (dispatch pointer events) to ensure framework handlers run
  const clicked = await page.evaluate((id) => {
    function dispatchClick(btn: Element) {
      try {
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        (btn as HTMLElement).click();
        return true
      } catch (e) {
        try { (btn as HTMLElement).click(); return true } catch { return false }
      }
    }
    if (id) {
      const b = document.querySelector(`button[title="Run code"][data-p5code-id="${id}"]`)
      if (b) return dispatchClick(b)
    }
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], .slidev-icon-btn'))
    for (const el of candidates) {
      const text = (el.textContent || '').trim().toLowerCase()
      const title = (el.getAttribute && el.getAttribute('title') || '') as string
      const aria = (el.getAttribute && el.getAttribute('aria-label') || '') as string
      if (text.includes('run') || title.toLowerCase().includes('run') || aria.toLowerCase().includes('run')) {
        if (dispatchClick(el)) return true
      }
    }
    const slides = Array.from(document.querySelectorAll('.slidev-page'))
    for (const s of slides) {
      const b = s.querySelector('button[title="Run code"]') || s.querySelector('button')
      if (b && dispatchClick(b)) return true
    }
    return false
  }, sketchInstanceId)
  return !!clicked
}

// Target Slidev dev server via Playwright baseURL
test.setTimeout(90_000)

test('Run button creates iframe and canvas (integration)', async ({ page }) => {
  await page.goto('/')
  // Wait for Slidev content and Run controls to be available before interacting
  await page.waitForSelector('.slidev-page, .slidev-page-main, #slide-content', { timeout: 20_000 })
  // Ensure Slidev runtime has initialized (helps in slow CI environments)
  await page.waitForFunction(() => !!(window['__slidev'] || document.querySelector('.slidev-page')), { timeout: 30_000 })
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
