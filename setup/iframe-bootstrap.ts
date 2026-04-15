export type IframeTheme = 'light' | 'dark'

type Color = { r: number; g: number; b: number; a: number }

const BACKGROUND_VAR_NAMES = [
  '--slide-background',
  '--slidev-background',
  '--background',
  '--bg',
  '--background-color',
  '--vp-background',
] as const

const DEFAULT_SLIDE_SELECTOR = '.slidev-page, .slidev-page-main, .slidev-page-content'

const parseColor = (input: string | null, htmlRoot: HTMLElement): Color | null => {
  if (!input) return null
  let s = input.trim().toLowerCase()
  const varMatch = s.match(/^var\((--[a-z0-9-_]+)\)$/i)
  if (varMatch) {
    const val = getComputedStyle(htmlRoot).getPropertyValue(varMatch[1]).trim()
    if (val) s = val.toLowerCase()
  }

  const rgbMatch = s.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\s*\)/)
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
      a: rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 1,
    }
  }

  const hexMatch = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hexMatch) {
    let hex = hexMatch[1]
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
    const intVal = parseInt(hex, 16)
    return {
      r: (intVal >> 16) & 255,
      g: (intVal >> 8) & 255,
      b: intVal & 255,
      a: 1,
    }
  }

  return null
}

const composite = (fg: Color, bg: Color): Color => {
  const fa = fg.a
  const ba = bg.a
  const outA = fa + ba * (1 - fa)
  if (outA === 0) return { r: 0, g: 0, b: 0, a: 0 }
  const r = (fg.r * fa + bg.r * ba * (1 - fa)) / outA
  const g = (fg.g * fa + bg.g * ba * (1 - fa)) / outA
  const b = (fg.b * fa + bg.b * ba * (1 - fa)) / outA
  return { r, g, b, a: outA }
}

const readBackgroundFromStyle = (style: CSSStyleDeclaration, htmlRoot: HTMLElement): Color | null => {
  let parsed = parseColor(style.backgroundColor || style.background || null, htmlRoot)
  if ((!parsed || parsed.a === 0) && typeof style.getPropertyValue === 'function') {
    for (const name of BACKGROUND_VAR_NAMES) {
      const val = style.getPropertyValue(name)
      if (val) {
        parsed = parseColor(val.trim(), htmlRoot)
        if (parsed) break
      }
    }
  }
  return parsed
}

const resolveBackground = (startEl: Element | null, htmlRoot: HTMLElement): Color | null => {
  let curr: Element | null = startEl
  let accumulated: Color | null = null
  while (curr && curr.nodeType === 1) {
    try {
      const style = getComputedStyle(curr as Element)
      const parsed = readBackgroundFromStyle(style, htmlRoot)
      if (parsed) {
        parsed.a = parsed.a ?? 1
        accumulated = accumulated ? composite(parsed, accumulated) : parsed
        if (accumulated.a >= 0.999) break
      }
    } catch (e) {
      // ignore and continue up
    }
    curr = curr.parentElement
  }
  return accumulated
}

export interface IframeBackgroundOptions {
  preferredElementId?: string
  preferredSelector?: string
}

export const computeIframeBackgroundTheme = (
  options: IframeBackgroundOptions = {}
): { computedBg: string; theme: IframeTheme } => {
  const htmlRoot = document.documentElement
  let themeGuess: IframeTheme = 'light'
  if (htmlRoot.classList.contains('slidev-theme-dark')) themeGuess = 'dark'
  if (htmlRoot.classList.contains('slidev-theme-light')) themeGuess = 'light'

  const candidateElements: Array<Element | null> = []
  if (options.preferredElementId) {
    candidateElements.push(document.getElementById(options.preferredElementId))
  }
  candidateElements.push(
    document.querySelector(options.preferredSelector || DEFAULT_SLIDE_SELECTOR),
    document.getElementById('slide-content'),
    document.querySelector(DEFAULT_SLIDE_SELECTOR)
  )

  let resolved: Color | null = null
  for (const element of candidateElements) {
    if (!element) continue
    try {
      const style = getComputedStyle(element)
      const direct = readBackgroundFromStyle(style, htmlRoot)
      if (direct && direct.a > 0) {
        resolved = direct
      } else {
        resolved = resolveBackground(element, htmlRoot)
      }
      if (resolved && resolved.a > 0) break
    } catch (e) {
      // ignore and continue
    }
  }

  if (!resolved) {
    resolved = themeGuess === 'dark'
      ? { r: 24, g: 24, b: 26, a: 1 }
      : { r: 255, g: 255, b: 255, a: 1 }
  }

  const computedBg = `rgba(${Math.round(resolved.r)}, ${Math.round(resolved.g)}, ${Math.round(resolved.b)}, ${Number(resolved.a.toFixed(3))})`
  const luminance = (0.2126 * resolved.r + 0.7152 * resolved.g + 0.0722 * resolved.b) / 255
  const theme: IframeTheme = luminance < 0.5 ? 'dark' : 'light'
  return { computedBg, theme }
}

export interface ApplyIframeThemeOptions {
  includeBodyTextColor?: boolean
}

export const applyThemeToIframeDocument = (
  iframeDocument: Document,
  computedBg: string,
  theme: IframeTheme,
  options: ApplyIframeThemeOptions = {}
): void => {
  const { includeBodyTextColor = false } = options
  const html = iframeDocument.documentElement
  const body = iframeDocument.body

  if (html) html.style.background = computedBg
  if (body) {
    body.style.background = computedBg
    if (includeBodyTextColor) {
      body.style.color = theme === 'dark' ? '#eee' : '#222'
    }
  }

  const iframeWindow = iframeDocument.defaultView as (Window & { __p5Addon?: { theme?: IframeTheme } }) | null
  if (iframeWindow?.__p5Addon) {
    iframeWindow.__p5Addon.theme = theme
  }
}

export interface IframeHtmlOptions {
  computedBg: string
  theme: IframeTheme
  sketchInstanceId: string
  p5ScriptUrl?: string
  scriptUrls?: string[]
  includeOriginalConsole?: boolean
  includeThemeOnAddon?: boolean
  includeBodyTextColor?: boolean
  readyMessageCount?: number
  requirePositiveCanvasSize?: boolean
}

export const measureCanvasDisplaySize = (
  canvas: HTMLCanvasElement,
  view: Pick<Window, 'devicePixelRatio' | 'getComputedStyle'> = window
): { width: number; height: number } => {
  const parseDimension = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 0 ? value : 0
    }
    if (typeof value !== 'string') {
      return 0
    }
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }

  const computed = typeof view.getComputedStyle === 'function'
    ? view.getComputedStyle(canvas)
    : null

  const rect = typeof canvas.getBoundingClientRect === 'function'
    ? canvas.getBoundingClientRect()
    : null

  const pixelRatio = Math.max(1, Number(view.devicePixelRatio) || 1)

  const width = Math.max(
    parseDimension(canvas.style?.width),
    parseDimension(computed?.width),
    parseDimension(rect?.width),
    parseDimension((canvas as HTMLCanvasElement & { clientWidth?: number }).clientWidth),
    parseDimension((canvas as HTMLCanvasElement & { offsetWidth?: number }).offsetWidth),
    parseDimension(canvas.width) / pixelRatio,
  )

  const height = Math.max(
    parseDimension(canvas.style?.height),
    parseDimension(computed?.height),
    parseDimension(rect?.height),
    parseDimension((canvas as HTMLCanvasElement & { clientHeight?: number }).clientHeight),
    parseDimension((canvas as HTMLCanvasElement & { offsetHeight?: number }).offsetHeight),
    parseDimension(canvas.height) / pixelRatio,
  )

  return {
    width: Math.round(width),
    height: Math.round(height),
  }
}

export const buildP5IframeHtml = (options: IframeHtmlOptions): string => {
  const {
    computedBg,
    theme,
    sketchInstanceId,
    p5ScriptUrl,
    scriptUrls,
    includeOriginalConsole = false,
    includeThemeOnAddon = false,
    includeBodyTextColor = false,
    readyMessageCount = 1,
    requirePositiveCanvasSize = false,
  } = options

  const readyMessages = Array.from({ length: Math.max(1, readyMessageCount) })
    .map(() => `window.parent.postMessage({ type: 'p5-iframe-ready', sketchInstanceId: window.__p5Addon.sketchInstanceId }, parentOrigin);`)
    .join('\n        ')
  const resizeCondition = requirePositiveCanvasSize
    ? 'width > 10 && height > 10 && (width !== lastWidth || height !== lastHeight)'
    : 'width !== lastWidth || height !== lastHeight'
  const textColorStyle = includeBodyTextColor ? `\n          color: ${theme === 'dark' ? '#eee' : '#222'};` : ''
  const scriptSources = scriptUrls && scriptUrls.length > 0
    ? scriptUrls
    : (p5ScriptUrl ? [p5ScriptUrl] : [])
  const p5ScriptTag = scriptSources
    .map((url) => `\n      <script src="${url}"></script>`)
    .join('')
  const measureCanvasDisplaySizeScript = measureCanvasDisplaySize.toString()
  const originalConsoleScript = includeOriginalConsole
    ? `
        window.__p5Addon.originalLog = window.console.log.bind(console);
        window.__p5Addon.originalError = window.console.error.bind(console);
        window.__p5Addon.originalWarn = window.console.warn.bind(console);
        // Override console methods to capture logs and forward them to the parent
        window.console.log = function(...args) {
          try {
            window.__p5Addon.logs.push({ level: 'log', args });
            window.parent.postMessage({ type: 'p5-console', level: 'log', args: args.map(a => (typeof a === 'string' ? a : (typeof a === 'object' ? JSON.stringify(a) : String(a)))), sketchInstanceId: window.__p5Addon.sketchInstanceId }, parentOrigin);
          } catch (e) { /* ignore */ }
          try { window.__p5Addon.originalLog.apply(console, args); } catch (e) { /* ignore */ }
        };
        window.console.error = function(...args) {
          try {
            window.__p5Addon.logs.push({ level: 'error', args });
            window.parent.postMessage({ type: 'p5-console', level: 'error', args: args.map(a => (typeof a === 'string' ? a : (typeof a === 'object' ? JSON.stringify(a) : String(a)))), sketchInstanceId: window.__p5Addon.sketchInstanceId }, parentOrigin);
          } catch (e) { /* ignore */ }
          try { window.__p5Addon.originalError.apply(console, args); } catch (e) { /* ignore */ }
        };
        window.console.warn = function(...args) {
          try {
            window.__p5Addon.logs.push({ level: 'warn', args });
            window.parent.postMessage({ type: 'p5-console', level: 'warn', args: args.map(a => (typeof a === 'string' ? a : (typeof a === 'object' ? JSON.stringify(a) : String(a)))), sketchInstanceId: window.__p5Addon.sketchInstanceId }, parentOrigin);
          } catch (e) { /* ignore */ }
          try { window.__p5Addon.originalWarn.apply(console, args); } catch (e) { /* ignore */ }
        };
        // Global error handlers: forward to parent as p5-error messages
        window.onerror = function(message, source, lineno, colno, error) {
          try {
            const payload = { type: 'p5-error', message: String(message), stack: (error && error.stack) ? error.stack : (source + ':' + lineno + ':' + colno), sketchInstanceId: window.__p5Addon.sketchInstanceId };
            window.parent.postMessage(payload, parentOrigin);
          } catch (e) { /* ignore */ }
          // Let the browser handle default logging as well
          return false;
        };
        window.addEventListener('unhandledrejection', function(ev) {
          try {
            const reason = ev && ev.reason ? (ev.reason.stack || String(ev.reason)) : String(ev);
            window.parent.postMessage({ type: 'p5-error', message: String(reason), sketchInstanceId: window.__p5Addon.sketchInstanceId }, parentOrigin);
          } catch (e) { /* ignore */ }
        });`
    : ''
  const themeScript = includeThemeOnAddon ? `\n        window.__p5Addon.theme = '${theme}';` : ''

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">${p5ScriptTag}
      <style>
        html, body {
          margin: 0;
          padding: 0;
          overflow: hidden;
          background: ${computedBg};
          display: flex;
          justify-content: center;
          align-items: center;${textColorStyle}
        }
        canvas {
          display: block;
        }
        #p5-container {
          display: flex;
          justify-content: center;
          align-items: center;
        }
      </style>
    </head>
    <body>
      <div id="p5-container"></div>
      <script>
        window.__p5Addon = {};
        window.__p5Addon.logs = [];${originalConsoleScript}
        window.__p5Addon.sketchInstanceId = '${sketchInstanceId}';${themeScript}

        let lastWidth = 0;
        let lastHeight = 0;
        const parentOrigin = (function(){
          try {
            if (document.referrer) return new URL(document.referrer).origin;
            if (window.location.ancestorOrigins && window.location.ancestorOrigins.length) return window.location.ancestorOrigins[0];
          } catch (e) {
            // ignore and fallback
          }
          return window.location.origin;
        })();
        const measureCanvasDisplaySize = ${measureCanvasDisplaySizeScript};

        const resizeIframe = () => {
          const canvas = document.querySelector('canvas');
          if (canvas) {
            const measured = measureCanvasDisplaySize(canvas, window);
            const width = measured.width + 4;
            const height = measured.height + 4;
            if (${resizeCondition}) {
              lastWidth = width;
              lastHeight = height;
              window.parent.postMessage({
                type: 'p5-resize',
                width: width,
                height: height,
                sketchInstanceId: window.__p5Addon.sketchInstanceId
              }, parentOrigin);
            }
          }
        };
        const observer = new MutationObserver(() => {
          setTimeout(resizeIframe, 100);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setInterval(resizeIframe, 500);
        ${readyMessages}
      </script>
    </body>
    </html>
  `
}
