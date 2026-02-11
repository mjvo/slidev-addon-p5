import { test, expect } from '@playwright/test'

// Allow more time for Slidev + p5 initialization across slides
test.setTimeout(90_000)

test('p5 iframe and canvas render', async ({ page }) => {
  await page.goto('/')
  // Wait for Slidev to render slide content and for Run controls or data markers
  await page.waitForSelector('.slidev-page, .slidev-page-main, #slide-content', { timeout: 20_000 })
  await page.waitForFunction(() => {
    return !!(document.querySelector('button[title="Run code"]') || document.querySelector('[data-p5code-id]'))
  }, { timeout: 20_000 })
  await page.click('body')

  // Advance through slides until at least one p5 iframe is visible
  for (let i = 0; i < 40; i++) {
    const visible = await page.locator('iframe.p5-canvas-iframe:visible').count()
    if (visible > 0) break
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(500)
  }

  // Helper: scan visible iframes for a rendered canvas
  const scanVisibleIframesForCanvas = async (perFrameTimeout = 800) => {
    const frames = page.locator('iframe.p5-canvas-iframe:visible')
    const count = await frames.count()
    for (let i = 0; i < count; i++) {
      const handle = await frames.nth(i).elementHandle()
      if (!handle) continue
      const frame = await handle.contentFrame()
      if (!frame) continue
      try {
        const canvas = await frame.waitForSelector('#p5-container canvas', { timeout: perFrameTimeout })
        if (canvas) {
          const box = await canvas.boundingBox()
          if (box && box.width > 0 && box.height > 0) return true
        }
      } catch (e) {
        // ignore
      }
    }
    return false
  }

  let foundAutoCanvas = false
  // Phase 1: look for automatically rendered canvases
  for (let step = 0; step < 60; step++) {
    if (await scanVisibleIframesForCanvas(1500)) {
      foundAutoCanvas = true
      break
    }
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(500)
  }

  let foundRunCanvas = false
  // Phase 2: click Run buttons when present and check for run-created canvases
  for (let step = 0; step < 12; step++) {
    const runButtons = page.locator('button.slidev-icon-btn[title="Run code"]:visible, button[title="Run code"]:visible')
    const runCount = await runButtons.count()
    if (runCount > 0) {
      for (let r = 0; r < runCount; r++) {
        const btn = runButtons.nth(r)
        const id = await btn.getAttribute('data-p5code-id')
        try { await btn.click() } catch { /* ignore */ }
        await page.waitForTimeout(600)

        if (id) {
          const sel = `iframe.p5-canvas-iframe[data-p5code-id="${id}"]`
          try {
            const handle = await page.waitForSelector(sel, { timeout: 2000 })
            if (handle) {
              const frame = await handle.contentFrame()
              if (frame) {
                const canvas = await frame.waitForSelector('#p5-container canvas', { timeout: 2000 })
                if (canvas) {
                  const box = await canvas.boundingBox()
                  if (box && box.width > 0 && box.height > 0) {
                    foundRunCanvas = true
                    break
                  }
                }
              }
            }
          } catch {
            // fallback to scanning visible iframes below
          }
        } else {
          if (await scanVisibleIframesForCanvas(1000)) {
            foundRunCanvas = true
            break
          }
        }
      }
    }
    if (foundRunCanvas) break
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(300)
  }

  // Accept either an auto-rendered canvas or a run-created canvas as success
  expect(foundAutoCanvas || foundRunCanvas).toBeTruthy()
})
