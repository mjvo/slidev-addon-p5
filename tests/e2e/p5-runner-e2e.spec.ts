import { test, expect, type Page } from '@playwright/test'
import {
  clickRunButton,
  navigateToFirstP5CodeSlide,
  navigateToSlideContainingText,
  waitForP5CanvasInFrame,
  waitForP5IframeReady,
  waitForSlidevDeckReady,
} from './helpers'

test.setTimeout(90_000)

async function setMonacoCode(page: Page, code: string): Promise<boolean> {
  return page.evaluate((nextCode) => {
    const win = window as unknown as {
      __monaco?: {
        editor?: {
          getModels?: () => Array<{ setValue?: (value: string) => void }>
        }
      }
      monaco?: {
        editor?: {
          getModels?: () => Array<{ setValue?: (value: string) => void }>
        }
      }
    }
    const models = win.__monaco?.editor?.getModels?.() ?? win.monaco?.editor?.getModels?.()
    if (!models || models.length === 0) return false
    const editableModel = models.find((model) => typeof model?.setValue === 'function')
    if (!editableModel || typeof editableModel.setValue !== 'function') return false
    editableModel.setValue(nextCode)
    return true
  }, code)
}

// Verifies that clicking Run inserts a stop button, renders a canvas inside
// the mapped iframe, and that the iframe's size reflects the canvas.
test('Run inserts stop button and iframe resizes', async ({ page }) => {
  await page.goto('/')
  // Ensure the Slidev UI is rendered and Run controls are available
  await waitForSlidevDeckReady(page)
  await page.waitForFunction(() => {
    return !!(document.querySelector('button[title="Run code"]') || document.querySelector('[data-p5code-id]'))
  }, { timeout: 20_000 })
  await page.click('body')

  // Navigate directly to the first slide that contains p5 code
  await navigateToFirstP5CodeSlide(page)

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
  const iframeAllow = await iframeHandle!.getAttribute('allow')
  expect(iframeAllow).toContain('camera')
  expect(iframeAllow).toContain('microphone')

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

test('first Run succeeds when iframe p5 load is delayed', async ({ page }) => {
  const p5ScriptPattern = '**/p5@*/lib/p5.min.js'
  let delayedRequestHandled = false
  await page.route(p5ScriptPattern, async (route) => {
    if (!delayedRequestHandled) {
      delayedRequestHandled = true
      await new Promise((resolve) => setTimeout(resolve, 3500))
    }
    await route.continue()
  })

  await page.goto('/')
  await waitForSlidevDeckReady(page)
  await page.waitForFunction(() => {
    return !!(document.querySelector('button[title="Run code"]') || document.querySelector('[data-p5code-id]'))
  }, { timeout: 20_000 })
  await page.click('body')
  await navigateToFirstP5CodeSlide(page)

  const clicked = await clickRunButton(page)
  if (!clicked) throw new Error('No Run button found on page')

  const id = await page.evaluate(() => {
    const el = document.querySelector('button[title="Run code"][data-p5code-id]') as HTMLElement | null
    return el?.getAttribute('data-p5code-id') || null
  })
  const iframeHandle = id
    ? await page.waitForSelector(`iframe.p5-canvas-iframe[data-p5code-id="${id}"]:visible`, { timeout: 20_000 })
    : await page.waitForSelector('iframe.p5-canvas-iframe:visible', { timeout: 20_000 })
  expect(iframeHandle).toBeTruthy()

  const frame = await iframeHandle!.contentFrame()
  expect(frame).toBeTruthy()

  const canvas = await waitForP5CanvasInFrame(frame!, 60_000)
  expect(canvas).toBeTruthy()
  await page.unroute(p5ScriptPattern)
})

test('Run surfaces loop-guard timeout for intentional infinite loop', async ({ page }) => {
  await page.goto('/')
  await waitForSlidevDeckReady(page)
  await page.waitForFunction(() => {
    return !!(document.querySelector('button[title="Run code"]') || document.querySelector('[data-p5code-id]'))
  }, { timeout: 20_000 })
  await page.click('body')
  await navigateToFirstP5CodeSlide(page)

  const replaced = await setMonacoCode(page, `
function setup() {
  createCanvas(80, 80)
}
while (true) {}
`)
  test.skip(!replaced, 'Monaco model is not exposed in this runtime; cannot inject infinite-loop code deterministically.')

  const clicked = await clickRunButton(page)
  if (!clicked) throw new Error('No Run button found on page')

  const err = page.locator('.p5-error-boundary .message').first()
  await expect(err).toContainText('Infinite loop protection triggered', { timeout: 20_000 })
})

test('Run delegates plain JavaScript to Slidev default output', async ({ page }) => {
  await page.goto('/')
  await waitForSlidevDeckReady(page)
  await page.waitForFunction(() => {
    return !!(document.querySelector('button[title="Run code"]') || document.querySelector('[data-p5code-id]'))
  }, { timeout: 20_000 })
  await page.click('body')
  await navigateToSlideContainingText(page, 'standard Monaco JavaScript still works')

  const activeSlide = page.locator(".slidev-page:not([style*='display: none'])").filter({
    hasText: 'standard Monaco JavaScript still works',
  }).first()
  await expect(activeSlide).toBeVisible({ timeout: 10_000 })

  const runButton = activeSlide.locator('button[title="Run code"]').first()
  await expect(runButton).toBeVisible({ timeout: 10_000 })
  await runButton.click()

  await expect(activeSlide.locator('.slidev-runner-output')).toContainText('plain-js-ok', { timeout: 20_000 })
  await expect(activeSlide.locator('.text-red-500')).toHaveCount(0)
})

test('Run succeeds for the buildFilterShader smoke test on p5 2.2.2', async ({ page }) => {
  const shaderCode = `
let myFilter;

function setup() {
  createCanvas(400, 400, WEBGL);
  noStroke();
  myFilter = buildFilterShader(gradient);
}

function draw() {
  filter(myFilter);
}

function gradient() {
  let leftColor = [1, 0.3, 0.2, 1];
  let rightColor = [0.1, 0.3, 1, 1];

  filterColor.begin();
  let t = filterColor.texCoord.x;
  filterColor.set(mix(leftColor, rightColor, t));
  filterColor.end();
}
`
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => {
    pageErrors.push(String(error))
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error')
      consoleErrors.push(msg.text())
  })

  await page.goto('/')
  await waitForSlidevDeckReady(page)
  await page.waitForFunction(() => {
    return !!(document.querySelector('button[title="Run code"]') || document.querySelector('[data-p5code-id]'))
  }, { timeout: 20_000 })
  await page.click('body')
  await navigateToFirstP5CodeSlide(page)

  const replaced = await setMonacoCode(page, shaderCode)
  test.skip(!replaced, 'Monaco model is not exposed in this runtime; cannot inject shader smoke-test code deterministically.')

  const activeSlide = page.locator(".slidev-page:not([style*='display: none'])").filter({
    has: page.locator('button[title="Run code"]'),
  }).first()
  await expect(activeSlide).toBeVisible({ timeout: 10_000 })

  const runButton = activeSlide.locator('button[title="Run code"]').first()
  await expect(runButton).toBeVisible({ timeout: 10_000 })
  await runButton.click()

  const sketchId = await runButton.getAttribute('data-p5code-id')
  const iframeHandle = sketchId
    ? await page.waitForSelector(`.slidev-page:not([style*='display: none']) iframe.p5-canvas-iframe[data-p5code-id="${sketchId}"]`, { timeout: 20_000 })
    : await page.waitForSelector(".slidev-page:not([style*='display: none']) iframe.p5-canvas-iframe:visible", { timeout: 20_000 })
  expect(iframeHandle).toBeTruthy()

  const frame = await iframeHandle!.contentFrame()
  expect(frame).toBeTruthy()

  await waitForP5IframeReady(page, sketchId, 20_000)
  const canvas = await waitForP5CanvasInFrame(frame!, 20_000)
  expect(canvas).toBeTruthy()

  await page.waitForTimeout(1000)
  await expect(activeSlide.locator('.p5-error-boundary .message')).toHaveCount(0)
  await expect(activeSlide.locator('.p5-log-panel')).toHaveCount(0)
  const relevantPageErrors = pageErrors.filter((message) => !message.includes('Wake Lock permission request denied'))
  expect(relevantPageErrors).toEqual([])
  expect(consoleErrors.some((message) => message.includes('buildFilterShader'))).toBeFalsy()
  expect(consoleErrors.some((message) => message.includes('Cannot read properties of undefined'))).toBeFalsy()
})
