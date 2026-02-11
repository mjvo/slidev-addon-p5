import { test, expect } from '@playwright/test'
import type { Frame, Page } from '@playwright/test'

test.setTimeout(90_000)

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

// Verifies that clicking Run inserts a stop button, renders a canvas inside
// the mapped iframe, and that the iframe's size reflects the canvas.
test('Run inserts stop button and iframe resizes', async ({ page }) => {
  await page.goto('/')
  // Ensure the Slidev UI is rendered and Run controls are available
  await page.waitForSelector('.slidev-page, .slidev-page-main, #slide-content', { timeout: 20_000 })
  await page.waitForFunction(() => {
    return !!(document.querySelector('button[title="Run code"]') || document.querySelector('[data-p5code-id]'))
  }, { timeout: 20_000 })
  await page.click('body')
  // Ensure Slidev runtime has initialized
  await page.waitForFunction(() => !!(window['__slidev'] || document.querySelector('.slidev-page')), { timeout: 30_000 })

    // Navigate directly to the first slide that contains p5 code
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
        // allow fallback behavior below if slide doesn't become visible in time
      }
    }

  // Prefer a visible Run button, but fall back to the first Run button and force-click it
  // Try robust Run click helper (handles Playwright visibility flakiness)
  const clicked = await clickRunButton(page)
  if (!clicked) throw new Error('No Run button found on page')
  // Attempt to discover iframe that should be created by the run
  const id = await page.evaluate(() => {
    const el = document.querySelector('button[title="Run code"][data-p5code-id]') as HTMLElement | null
    return el?.getAttribute('data-p5code-id') || null
  })

  // Stop button should appear next to the play button
  const stopBtn = page.locator('.p5-stop-btn')
  await expect(stopBtn).toBeVisible({ timeout: 5000 })

  // If we have an id, target the corresponding iframe; otherwise scan visible iframes
  let iframeHandle
  if (id) {
    iframeHandle = await page.waitForSelector(`iframe.p5-canvas-iframe[data-p5code-id="${id}"]:visible`, { timeout: 10_000 })
  } else {
    // fallback to any visible iframe
    iframeHandle = await page.waitForSelector('iframe.p5-canvas-iframe:visible', { timeout: 10_000 })
  }
  expect(iframeHandle).toBeTruthy()

  const frame = await iframeHandle!.contentFrame()
  expect(frame).toBeTruthy()

  // Prefer explicit p5-ready handshake from iframe, then validate canvas
  const sketchId = await iframeHandle!.getAttribute('data-p5code-id')
  await waitForP5IframeReady(page, sketchId, 15_000)
  const canvas = await waitForP5CanvasInFrame(frame, 60_000)
  expect(canvas).toBeTruthy()
  const canvasBox = await canvas.boundingBox()
  expect(canvasBox && canvasBox.width > 0 && canvasBox.height > 0).toBeTruthy()

  // Confirm iframe element's size increased to match canvas (rough check)
  const iframeBox = await iframeHandle!.boundingBox()
  expect(iframeBox).toBeTruthy()
  if (iframeBox && canvasBox) {
    expect(iframeBox.width).toBeGreaterThanOrEqual(Math.max(1, Math.floor(canvasBox.width * 0.8)))
    expect(iframeBox.height).toBeGreaterThanOrEqual(Math.max(1, Math.floor(canvasBox.height * 0.8)))
  }
})
