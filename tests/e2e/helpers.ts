import type { Frame, Page } from '@playwright/test'

export async function waitForSlidevDeckReady(page: Page): Promise<void> {
  await page.waitForSelector('.slidev-page, .slidev-page-main, #slide-content', { timeout: 20_000 })
  await page.waitForFunction(() => !!(window['__slidev'] || document.querySelector('.slidev-page')), { timeout: 30_000 })
}

async function closeTransientSlidevUi(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => {})
  await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    active?.blur?.()
  }).catch(() => {})
}

async function getVisibleSlideNo(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const visibleSlide = Array.from(document.querySelectorAll('.slidev-page'))
      .find((element) => {
        const htmlElement = element as HTMLElement
        const style = window.getComputedStyle(htmlElement)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })
    return visibleSlide?.getAttribute('data-slidev-no') || null
  })
}

async function goToSlide(page: Page, slideNo: string | number): Promise<string | null> {
  const target = String(slideNo)
  await closeTransientSlidevUi(page)
  const origin = new URL(page.url()).origin
  await page.goto(`${origin}/${target}`, { waitUntil: 'domcontentloaded' })
  await waitForSlidevDeckReady(page)
  await page.waitForFunction((expectedSlideNo) => {
    const targetSlide = document.querySelector(`.slidev-page[data-slidev-no="${expectedSlideNo}"]`)
    if (!(targetSlide instanceof HTMLElement))
      return false
    const style = window.getComputedStyle(targetSlide)
    return style.display !== 'none' && style.visibility !== 'hidden'
  }, target, { timeout: 30_000 })
  await closeTransientSlidevUi(page)
  return getVisibleSlideNo(page)
}

export async function waitForP5CanvasInFrame(frame: Frame, timeout = 30_000) {
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
  try { await frame.waitForFunction(() => !!document.querySelector('canvas'), { timeout }) } catch (e) { void e }
  return frame.$('canvas')
}

export async function waitForP5IframeReady(page: Page, sketchInstanceId: string | null = null, timeout = 15_000) {
  try {
    await page.waitForFunction((id) => {
      const selector = id
        ? `iframe.p5-canvas-iframe[data-p5code-id="${id}"]`
        : 'iframe.p5-canvas-iframe'
      const iframe = document.querySelector(selector)
      if (!(iframe instanceof HTMLIFrameElement)) {
        return false
      }
      const iframeWindow = iframe.contentWindow as (Window & {
        p5?: unknown
        __p5Addon?: {
          sketchInstanceId?: unknown
        }
      }) | null
      if (!iframeWindow) {
        return false
      }
      const iframeDocument = iframeWindow.document
      const addonSketchId = iframeWindow.__p5Addon?.sketchInstanceId
      const hasMatchingSketchId = !id || addonSketchId === id
      return Boolean(
        hasMatchingSketchId
        && iframeDocument
        && (
          typeof iframeWindow.p5 !== 'undefined'
          || iframeDocument.getElementById('p5-container')
          || iframeDocument.querySelector('canvas')
        )
      )
    }, sketchInstanceId, { timeout })
    return true
  } catch (e) {
    return false
  }
}

export async function clickRunButton(page: Page, sketchInstanceId: string | null = null): Promise<boolean> {
  await closeTransientSlidevUi(page)
  const clicked = await page.evaluate((id) => {
    function dispatchClick(btn: Element) {
      try {
        const htmlButton = btn as HTMLElement
        htmlButton.scrollIntoView({ block: 'center', inline: 'center' })
        htmlButton.focus?.()
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
        btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }))
        htmlButton.click()
        return true
      } catch (e) {
        try { (btn as HTMLElement).click(); return true } catch { return false }
      }
    }
    const visibleSlide = Array.from(document.querySelectorAll('.slidev-page'))
      .find((element) => {
        const htmlElement = element as HTMLElement
        const style = window.getComputedStyle(htmlElement)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })

    if (id) {
      const scopedButton = visibleSlide?.querySelector(`[data-p5code-id="${id}"] button[title="Run code"], button[title="Run code"][data-p5code-id="${id}"]`)
      if (scopedButton) return dispatchClick(scopedButton)
      const globalButton = document.querySelector(`[data-p5code-id="${id}"] button[title="Run code"], button[title="Run code"][data-p5code-id="${id}"]`)
      if (globalButton) return dispatchClick(globalButton)
    }
    const candidates = Array.from(visibleSlide?.querySelectorAll('button, [role="button"], .slidev-icon-btn') || [])
    for (const el of candidates) {
      const text = (el.textContent || '').trim().toLowerCase()
      const title = (el.getAttribute && el.getAttribute('title') || '') as string
      const aria = (el.getAttribute && el.getAttribute('aria-label') || '') as string
      if (text.includes('run') || title.toLowerCase().includes('run') || aria.toLowerCase().includes('run')) {
        if (dispatchClick(el)) return true
      }
    }
    return false
  }, sketchInstanceId)
  return !!clicked
}

export async function navigateToFirstP5CodeSlide(page: Page): Promise<string | null> {
  await waitForSlidevDeckReady(page)
  const targetSlideNo = await page.evaluate(() => {
    const runnableSlide = Array.from(document.querySelectorAll('.slidev-page'))
      .find((slide) => slide.querySelector('[data-p5code-id] button[title="Run code"], button[title="Run code"]'))
    return runnableSlide?.getAttribute('data-slidev-no') || null
  })
  if (!targetSlideNo)
    return null
  await goToSlide(page, targetSlideNo)
  return targetSlideNo
}

export async function navigateToSlideContainingText(page: Page, text: string): Promise<string | null> {
  await waitForSlidevDeckReady(page)
  await page.waitForFunction((targetText) => {
    return Array.from(document.querySelectorAll('.slidev-page'))
      .some((slide) => (slide.textContent || '').includes(targetText))
  }, text, { timeout: 20_000 })
  const targetSlideNo = await page.evaluate((targetText) => {
    const targetSlide = Array.from(document.querySelectorAll('.slidev-page'))
      .find((slide) => (slide.textContent || '').includes(targetText))
    return targetSlide?.getAttribute('data-slidev-no') || null
  }, text)
  if (!targetSlideNo)
    return null
  await goToSlide(page, targetSlideNo)
  return targetSlideNo
}
