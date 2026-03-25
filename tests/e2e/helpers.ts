import type { Frame, Page } from '@playwright/test'

export async function waitForSlidevDeckReady(page: Page): Promise<void> {
  await page.waitForSelector('.slidev-page, .slidev-page-main, #slide-content', { timeout: 20_000 })
  await page.waitForFunction(() => !!(window['__slidev'] || document.querySelector('.slidev-page')), { timeout: 30_000 })
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

export async function clickRunButton(page: Page, sketchInstanceId: string | null = null): Promise<boolean> {
  try {
    const btnHandle = await page.waitForSelector('button[title="Run code"]', { timeout: 8_000 }).catch(() => null)
    if (btnHandle) {
      try {
        await btnHandle.click().catch(() => {})
        const box = await btnHandle.boundingBox()
        if (!box)
          await btnHandle.click({ force: true }).catch(() => {})
        else
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        return true
      } catch (e) {
        // fall through to DOM fallback below
      }
    }
  } catch (e) { void e }

  const clicked = await page.evaluate((id) => {
    function dispatchClick(btn: Element) {
      try {
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
        btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }))
        ;(btn as HTMLElement).click()
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

export async function navigateToFirstP5CodeSlide(page: Page): Promise<string | null> {
  await page.waitForFunction(() => typeof window !== 'undefined', { timeout: 20_000 })
  const targetSlideNo = await page.evaluate(() => {
    const el = document.querySelector('[data-p5code-id]') as HTMLElement | null
    return el?.closest('.slidev-page')?.getAttribute('data-slidev-no') || null
  })
  if (!targetSlideNo) return null

  await page.evaluate((n) => { location.href = `${location.origin}/${n}` }, targetSlideNo)
  try {
    await page.waitForSelector(`.slidev-page[data-slidev-no='${targetSlideNo}']:not([style*="display: none"])`, { timeout: 30_000 })
  } catch (e) {
    // Allow fallback behavior if the target slide does not become visible in time
  }
  return targetSlideNo
}

export async function navigateToSlideContainingText(page: Page, text: string): Promise<string | null> {
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
  await page.waitForSelector(`.slidev-page[data-slidev-no='${targetSlideNo}']:not([style*="display: none"]), .slidev-page[data-slidev-no='${targetSlideNo}']`, { timeout: 30_000 })
  return targetSlideNo
}
