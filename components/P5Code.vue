<template>
  <div
    class="p5-canvas-wrapper"
    :style="wrapperStyle"
  >
    <!-- Monaco editor slot (left side or top) -->
    <div
      class="p5-editor-container"
      :style="editorStyle"
      :data-p5code-id="sketchInstanceId"
    >
      <slot />
    </div>
    
    <!-- Canvas container - either iframe or DOM (right side or bottom) -->
    <div
      class="p5-canvas-container"
      :style="canvasStyle"
    >
      <P5ErrorBoundary
        v-if="errorMessage"
        :message="errorMessage"
        @clear="errorMessage = null"
      />
      <iframe
        ref="iframeElement"
        class="p5-canvas-iframe"
        :title="`p5.js Canvas - ${displayOnly ? 'Display Only' : 'Interactive'}`"
        :data-p5code-id="sketchInstanceId"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/* eslint-disable no-useless-escape */
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import P5ErrorBoundary from './P5ErrorBoundary.vue'
import { createSketchId } from '../setup/id'
import type { CSSProperties } from 'vue'
import { IframeMessageHandler } from '../setup/iframe-message-handler'
import { IframeResizeHandler } from '../setup/iframe-resize-handler'
import { getP5LoadUrl } from '../setup/p5-version-manager'
import { safeRemoveP5 } from '../setup/p5-utils'
import { nextTick } from 'vue'

// Dynamic require for loop-protect to avoid bundler/runtime issues in some setups
/* eslint-disable @typescript-eslint/no-var-requires */
let loopProtect: ((code: string, opts?: Record<string, unknown>) => string) | undefined
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // @ts-expect-error -- dynamic require used for optional dependency
  const lp = require('loop-protect')
  if (typeof lp === 'function') loopProtect = lp
} catch (e) {
  void 0
}
/* eslint-enable @typescript-eslint/no-var-requires */

interface Props {
  displayOnly?: boolean
  p5Version?: string   // Specific p5.js version to load (e.g., '2.2.0', '2.1.0')
  p5CdnUrl?: string    // Custom CDN URL for p5.js (overrides version if set)
}

type Color = { r: number; g: number; b: number; a: number }

const props = withDefaults(defineProps<Props>(), {
  displayOnly: false,
  p5Version: undefined,  // Use latest stable version
  p5CdnUrl: undefined,   // Use CDN URL determined by version
})

const iframeElement = ref<HTMLIFrameElement>()
const iframeWindow = ref<Window | null>(null)
const iframeReady = ref(false)  // Track if iframe has initialized
const errorMessage = ref<string | null>(null)
const messageHandler = ref<IframeMessageHandler | null>(null)  // Handler for iframe messages (Monaco/editor-specific)
const messageHandlerFn = ref<((event: MessageEvent) => void) | null>(null)  // Stable function reference for addEventListener/removeEventListener
let resizeHandler: IframeResizeHandler | null = null
const sketchInstanceId = ref<string>(createSketchId())

// Note: message routing is delegated to `IframeMessageHandler` via `messageHandlerFn` below.

// Monaco code-runner registration (moved into script scope)
let unregisterMonacoRunner: (() => void) | null = null
  try {
  // @ts-expect-error - Slidev injects window.__monaco and window.__slidev
  const monacoGlobal = (window as unknown as { __monaco?: unknown }).__monaco
  // @ts-expect-error - slidevGlobal may be injected by Slidev at runtime
  const slidevGlobal = (window as unknown as { __slidev?: unknown }).__slidev
  if (monacoGlobal && slidevGlobal && slidevGlobal.registerCodeRunner) {
    unregisterMonacoRunner = slidevGlobal.registerCodeRunner({
      language: 'js',
      options: { sketchInstanceId: sketchInstanceId.value },
    })
  }
} catch (e) {
  // ignore in non-Slidev environments
}

// Computed styles for flex layout (always side-by-side)
const wrapperStyle = computed(() => ({
  display: 'flex',
  flexDirection: 'row' as CSSProperties['flexDirection'],
  gap: '1rem',
  width: '100%',
  minHeight: '500px',
}))

const editorStyle = computed(() => ({
  flex: '0 0 50%',
  width: '50%',
  minWidth: '0',
  display: 'flex',
  flexDirection: 'column' as CSSProperties['flexDirection'],
}))

const canvasStyle = computed(() => ({
  flex: '0 0 50%',
  width: '50%',
  minHeight: '500px',
  display: 'flex',
  alignItems: 'flex-start' as CSSProperties['alignItems'],
  justifyContent: 'center' as CSSProperties['justifyContent'],
}))

/**
 * Initialize iframe with p5.js library
 */
const initializeIframe = () => {
  if (!iframeElement.value) return

  const iframe = iframeElement.value
  // Generate a new sketchInstanceId for each iframe init
  sketchInstanceId.value = createSketchId()
  iframe.setAttribute('data-p5code-id', sketchInstanceId.value)

  // Completely clear all inline styles to ensure clean slate
  iframe.style.cssText = ''
  iframe.style.setProperty('width', 'auto', 'important')
  iframe.style.setProperty('height', '400px', 'important')
  iframe.style.setProperty('min-height', '400px', 'important')
  iframe.style.setProperty('max-height', 'none', 'important')

  // Also reset parent container styles
  const container = iframe.parentElement
  if (container) {
    container.style.minHeight = ''
    container.style.maxHeight = ''
  }

  const doc = iframe.contentDocument || iframe.contentWindow?.document
  if (!doc) {
    return
  }

  // Determine p5.js CDN URL based on version prop
  const p5LoadUrl = getP5LoadUrl({
    version: props.p5Version,
    cdnUrl: props.p5CdnUrl,
  })

  // Robust background detection (supports CSS vars + alpha compositing)
  const htmlRoot = document.documentElement;
  const parseColor = (input: string | null): Color | null => {
    if (!input) return null
    let s = input.trim().toLowerCase()
    const varMatch = s.match(/^var\((--[a-z0-9-_]+)\)$/i)
    if (varMatch) {
      const val = getComputedStyle(htmlRoot).getPropertyValue(varMatch[1]).trim()
      if (val) s = val.toLowerCase()
    }
    const rgbMatch = s.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\s*\)/)
    if (rgbMatch) {
      return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]), a: rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 1 }
    }
    const hexMatch = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (hexMatch) {
      let hex = hexMatch[1]
      if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
      const intVal = parseInt(hex, 16)
      return { r: (intVal >> 16) & 255, g: (intVal >> 8) & 255, b: intVal & 255, a: 1 }
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

  const resolveBackground = (el: Element | null): Color | null => {
    let curr: Element | null = el
    let accumulated: Color | null = null
    const varNames = ['--slide-background','--slidev-background','--background','--bg','--background-color','--vp-background']
    while (curr && curr.nodeType === 1) {
      try {
        const style = getComputedStyle(curr as Element)
        let bg = style.backgroundColor || style.background || ''
        bg = bg && bg !== 'initial' ? bg : ''
        let parsed = parseColor(bg || null)
        if ((!parsed || parsed.a === 0) && typeof style.getPropertyValue === 'function') {
          for (const name of varNames) {
            const val = style.getPropertyValue(name)
            if (val) {
              parsed = parseColor(val.trim())
              if (parsed) break
            }
          }
        }
        if (parsed) {
          parsed.a = parsed.a ?? 1
          if (!accumulated) accumulated = parsed
          else accumulated = composite(parsed, accumulated)
          if (accumulated.a >= 0.999) break
        }
      } catch (e) {
        // ignore and continue
      }
      curr = curr.parentElement
    }
    return accumulated
  }

  const computeBackground = (): { computedBg: string; theme: 'dark' | 'light' } => {
    let themeGuess = 'light'
    if (htmlRoot.classList.contains('slidev-theme-dark')) themeGuess = 'dark'
    if (htmlRoot.classList.contains('slidev-theme-light')) themeGuess = 'light'
    const slideContainer = document.querySelector('.slidev-page, .slidev-page-main, .slidev-page-content')
    let resolved: Color | null = null
    if (slideContainer) {
      const style = getComputedStyle(slideContainer)
      const direct = parseColor(style.backgroundColor || style.background || null)
      if (direct && direct.a && direct.a > 0) resolved = direct
      else {
        for (const name of ['--slide-background','--slidev-background','--background','--bg','--background-color','--vp-background']) {
          const val = style.getPropertyValue(name)
          if (val) {
            const p = parseColor(val.trim())
            if (p && p.a > 0) { resolved = p; break }
          }
        }
        if (!resolved) resolved = resolveBackground(slideContainer)
      }
    }
    if (!resolved) resolved = themeGuess === 'dark' ? { r: 24, g: 24, b: 26, a: 1 } : { r: 255, g: 255, b: 255, a: 1 }
    const computedBg = `rgba(${Math.round(resolved.r)}, ${Math.round(resolved.g)}, ${Math.round(resolved.b)}, ${Number(resolved.a.toFixed(3))})`
    const luminance = (0.2126 * resolved.r + 0.7152 * resolved.g + 0.0722 * resolved.b) / 255
    const theme = luminance < 0.5 ? 'dark' : 'light'
    return { computedBg, theme }
  }

  const { computedBg, theme } = computeBackground()

  // Build HTML content with p5.js and minimal styling, using detected background
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="${p5LoadUrl}"><\/script>
      <style>
        html, body {
          margin: 0;
          padding: 0;
          overflow: hidden;
          background: ${computedBg};
          display: flex;
          justify-content: center;
          align-items: center;
          color: ${theme === 'dark' ? '#eee' : '#222'};
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
        window.__p5Addon.logs = [];
        window.__p5Addon.originalLog = window.console.log.bind(console);
        window.__p5Addon.originalError = window.console.error.bind(console);
        window.__p5Addon.originalWarn = window.console.warn.bind(console);
        window.__p5Addon.sketchInstanceId = '${sketchInstanceId.value}';
        window.__p5Addon.theme = '${theme}';
        //window.__p5Addon.originalLog('[p5 iframe] Console capture enabled - wrapper active');
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

        const resizeIframe = () => {
          const canvas = document.querySelector('canvas');
          if (canvas) {
            const width = canvas.offsetWidth + 4;
            const height = canvas.offsetHeight + 4;
            if (width !== lastWidth || height !== lastHeight) {
              lastWidth = width;
              lastHeight = height;
              // window.__p5Addon.originalLog('[p5 iframe resize] Detected canvas ' + width + 'x' + height + ', sending message to parent');
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
        window.parent.postMessage({ type: 'p5-iframe-ready', sketchInstanceId: window.__p5Addon.sketchInstanceId }, parentOrigin);
      <\/script>
    </body>
    </html>
  `

  doc.open()
  doc.write(html)
  doc.close()

  iframeWindow.value = iframe.contentWindow
}

/**
 * Execute p5 code in iframe context
 * Called by code runner via postMessage
 */
const executeInIframe = async (code: string) => {
  if (!iframeElement.value || !iframeWindow.value) {
    console.error('[p5 addon] Iframe window not available')
    return { error: 'Iframe not ready' }
  }
  // Reset iframe size styles before running new sketch
  /* console.log('[P5Code] Resetting iframe size before sketch:', {
    width: iframeElement.value.style.width,
    height: iframeElement.value.style.height,
    minWidth: iframeElement.value.style.minWidth,
    minHeight: iframeElement.value.style.minHeight,
    maxWidth: iframeElement.value.style.maxWidth,
    maxHeight: iframeElement.value.style.maxHeight,
  }); */
  iframeElement.value.style.width = 'auto';
  iframeElement.value.style.height = '400px';
  iframeElement.value.style.minWidth = '';
  iframeElement.value.style.minHeight = '';
  iframeElement.value.style.maxWidth = '';
  iframeElement.value.style.maxHeight = '';
  /* console.log('[P5Code] After reset:', {
    width: iframeElement.value.style.width,
    height: iframeElement.value.style.height,
    minWidth: iframeElement.value.style.minWidth,
    minHeight: iframeElement.value.style.minHeight,
    maxWidth: iframeElement.value.style.maxWidth,
    maxHeight: iframeElement.value.style.maxHeight,
  }); */
  const container = iframeElement.value.parentElement
  if (container) {
    container.style.minHeight = ''
    container.style.maxHeight = ''
  }

  // This ensures a clean state, especially when navigating between slides
  // The iframe document persists across slide navigation, so we need to reset it
  const doc = iframeWindow.value.document;
  const { computedBg: _computedBg } = (function(): { computedBg: string; theme: 'dark' | 'light' } {
    const htmlRoot = document.documentElement
    const parseColor = (input: string | null): Color | null => {
      if (!input) return null
      let s = input.trim().toLowerCase()
      const varMatch = s.match(/^var\((--[a-z0-9-_]+)\)$/i)
      if (varMatch) {
        const val = getComputedStyle(htmlRoot).getPropertyValue(varMatch[1]).trim()
        if (val) s = val.toLowerCase()
      }
      const rgbMatch = s.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\s*\)/)
      if (rgbMatch) {
        return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]), a: rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 1 }
      }
      const hexMatch = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
      if (hexMatch) {
        let hex = hexMatch[1]
        if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
        const intVal = parseInt(hex, 16)
        return { r: (intVal >> 16) & 255, g: (intVal >> 8) & 255, b: intVal & 255, a: 1 }
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
    const resolveBackground = (el: Element | null): Color | null => {
      let curr: Element | null = el
      let accumulated: Color | null = null
      const varNames = ['--slide-background','--slidev-background','--background','--bg','--background-color','--vp-background']
      while (curr && curr.nodeType === 1) {
        try {
          const style = getComputedStyle(curr as Element)
          let bg = style.backgroundColor || style.background || ''
          bg = bg && bg !== 'initial' ? bg : ''
          let parsed = parseColor(bg || null)
          if ((!parsed || parsed.a === 0) && typeof style.getPropertyValue === 'function') {
            for (const name of varNames) {
              const val = style.getPropertyValue(name)
              if (val) {
                parsed = parseColor(val.trim())
                if (parsed) break
              }
            }
          }
          if (parsed) {
            parsed.a = parsed.a ?? 1
            if (!accumulated) accumulated = parsed
            else accumulated = composite(parsed, accumulated)
            if (accumulated.a >= 0.999) break
          }
        } catch (e) {
          // ignore and continue
        }
        curr = curr.parentElement
      }
      return accumulated
    }
    const slideContainer = document.querySelector('.slidev-page, .slidev-page-main, .slidev-page-content')
    let resolved: Color | null = null
    if (slideContainer) {
      const style = getComputedStyle(slideContainer)
      const direct = parseColor(style.backgroundColor || style.background || null)
      if (direct && direct.a && direct.a > 0) resolved = direct
      else {
        for (const name of ['--slide-background','--slidev-background','--background','--bg','--background-color','--vp-background']) {
          const val = style.getPropertyValue(name)
          if (val) {
            const p = parseColor(val.trim())
            if (p && p.a > 0) { resolved = p; break }
          }
        }
        if (!resolved) resolved = resolveBackground(slideContainer)
      }
    }
    if (!resolved) {
      const htmlRoot = document.documentElement
      const themeGuess = htmlRoot.classList.contains('slidev-theme-dark') ? 'dark' : 'light'
      resolved = themeGuess === 'dark' ? { r: 24, g: 24, b: 26, a: 1 } : { r: 255, g: 255, b: 255, a: 1 }
    }
    const computedBg = `rgba(${Math.round(resolved.r)}, ${Math.round(resolved.g)}, ${Math.round(resolved.b)}, ${Number(resolved.a.toFixed(3))})`
    const luminance = (0.2126 * resolved.r + 0.7152 * resolved.g + 0.0722 * resolved.b) / 255
    const theme = luminance < 0.5 ? 'dark' : 'light'
    return { computedBg, theme }
  })()
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        html, body {
          margin: 0;
          padding: 0;
          overflow: hidden;
          background: ${_computedBg};
          display: flex;
          justify-content: center;
          align-items: center;
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
        window.__p5Addon.logs = [];
        window.__p5Addon.originalLog = window.console.log.bind(console);
        window.__p5Addon.originalError = window.console.error.bind(console);
        window.__p5Addon.originalWarn = window.console.warn.bind(console);
        window.__p5Addon.sketchInstanceId = '${sketchInstanceId.value}';

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

        const resizeIframe = () => {
          const canvas = document.querySelector('canvas');
          if (canvas) {
            const width = canvas.offsetWidth + 4;
            const height = canvas.offsetHeight + 4;
            
            if (width !== lastWidth || height !== lastHeight) {
              lastWidth = width;
              lastHeight = height;
              // window.__p5Addon.originalLog('[p5 iframe resize] Detected canvas ' + width + 'x' + height + ', sending message to parent');
              window.parent.postMessage({ 
                type: 'p5-resize', 
                width: width, 
                height: height,
                sketchInstanceId: window.__p5Addon.sketchInstanceId,
              }, parentOrigin);
            }
          }
        };

        const observer = new MutationObserver(() => {
          setTimeout(resizeIframe, 100);
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
        setInterval(resizeIframe, 500);

        window.parent.postMessage({ type: 'p5-iframe-ready', sketchInstanceId: window.__p5Addon.sketchInstanceId }, parentOrigin);
      <\/script>
    </body>
    </html>
  `

  doc.open()
  doc.write(html)
  doc.close()

  try {
    // Inject code via blob URL instead of eval
    let codeToInject = code
    try {
      if (loopProtect) {
        codeToInject = loopProtect(codeToInject, { id: `lp-${Date.now()}` })
      }
    } catch (e) {
      void e
    }
    const blob = new Blob([codeToInject], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    const scriptEl = iframeWindow.value.document.createElement('script')
    scriptEl.src = url
    // Append before awaiting so load events can fire
    iframeWindow.value.document.body.appendChild(scriptEl)
    const result = await new Promise<string | undefined>((resolve, reject) => {
      scriptEl.onload = () => {
        try { URL.revokeObjectURL(url) } catch (e) { void 0 }
        resolve(undefined)
      }
      scriptEl.onerror = () => {
        try { URL.revokeObjectURL(url) } catch (e) { void 0 }
        reject(new Error('Error loading injected iframe script'))
      }
    })
    return { success: true, result }
  } catch (error: unknown) {
    console.error('[p5 addon] Error executing code in iframe:', error)
    const msg = (error as { message?: unknown } | null)?.message
    const emsg = typeof msg === 'string' ? msg : String(error)
    errorMessage.value = emsg
    return { error: emsg }
  }
}

/**
 * Cleanup p5 instance
 */
const cleanupP5 = () => {
  if (iframeWindow.value && iframeWindow.value.p5 && iframeWindow.value.p5.instance) {
    try {
      safeRemoveP5(iframeWindow.value.p5.instance)
    } catch (error) {
      console.error('[p5 addon] Error cleaning up p5 instance:', error)
    }
  }
  // p5Instance is stored inside the iframe; nothing to clear locally
}

// NOTE: allowed origins are provided to the resize/message handlers inline
// and we avoid a separate global constant to reduce unused-variable warnings.

/**
 * Handle messages from iframe
 * Delegates to IframeMessageHandler for type-safe routing and origin validation
 */
const createMessageHandler = () => {
  return (event: MessageEvent) => {
    if (!messageHandler.value) return
    // Delegate to handler
    try {
      messageHandler.value.handle(event)
    } catch (e) {
      // swallow
    }
  }
}

onMounted(() => {
  // Always initialize iframe (DOM fallback removed)
  initializeIframe()

  // Use the shared IframeResizeHandler for resize messages, passing sketchInstanceId
  resizeHandler = new IframeResizeHandler({
    allowedOrigins: [window.location.origin],
    sketchInstanceId: sketchInstanceId.value,
    expectedSource: () => iframeElement.value?.contentWindow ?? null,
    requireSketchInstanceId: true,
    onResize: (width, height, incomingSketchId) => {
      if (incomingSketchId && incomingSketchId !== sketchInstanceId.value) {
        console.log('[P5Code] Ignoring resize for old sketchInstanceId', incomingSketchId, 'current:', sketchInstanceId.value);
        return;
      }
      iframeElement.value.style.setProperty('width', `${width}px`, 'important')
      iframeElement.value.style.setProperty('height', `${height}px`, 'important')
      iframeElement.value.style.setProperty('min-height', `${height}px`, 'important')
      iframeElement.value.style.setProperty('max-height', `${height}px`, 'important')
      // Also update parent container to match
      const container = iframeElement.value.parentElement
      if (container) {
        container.style.setProperty('max-height', `${height}px`, 'important')
      }
    },
    throttleMs: 150,
  })
  resizeHandler.start()

  // Monaco/editor-specific message handling (ready, error, execution complete)
  messageHandler.value = new IframeMessageHandler({
    onReady: () => {
      iframeReady.value = true
    },
    onResize: () => {}, // Handled by resizeHandler
    onError: (data: unknown) => {
      try {
        const d = data as { sketchInstanceId?: string; error?: unknown; message?: unknown } | null
        // Only surface errors intended for this sketch instance
        if (d && d.sketchInstanceId && d.sketchInstanceId !== sketchInstanceId.value) return
        const msg = (d && (d.error || d.message)) ? (d.error || d.message) : JSON.stringify(d)
        errorMessage.value = String(msg)
      } catch (e) {
        errorMessage.value = String(data)
      }
      console.error('[p5 addon] Error in iframe:', data)
    },
    onExecutionComplete: () => {
      // Code execution completed
    },
    allowedOrigins: [window.location.origin],
    expectedSource: () => iframeElement.value?.contentWindow ?? null,
    requireSketchInstanceId: true,
    expectedSketchInstanceId: () => sketchInstanceId.value,
  })
  // Store message handler reference on iframe element for code-runners.ts access
  if (iframeElement.value) {
    const fe = iframeElement.value as unknown as Record<string, unknown>
    fe.__messageHandler = messageHandler.value
  }
  // Map visible Run buttons to this code block's `data-p5code-id` so tests and runners
  // can deterministically find the target iframe for a given Run button.
  // We try to find a Run button near the editor container and set `data-p5code-id`.
  nextTick(() => {
    try {
      const editorEl = document.querySelector(`[data-p5code-id="${sketchInstanceId.value}"]`)
      if (editorEl) {
        // Search for ancestor/adjacent run buttons within reasonable DOM distance
        const candidateButtons = Array.from(document.querySelectorAll('button[title="Run code"], button.slidev-icon-btn[title="Run code"]')) as HTMLButtonElement[]
        for (const btn of candidateButtons) {
          // If the button is inside the editor container or shares a common ancestor within two levels, associate it
          if (editorEl.contains(btn) || btn.closest('[data-p5code-id]') === editorEl) {
            btn.dataset.p5codeId = sketchInstanceId.value
          } else {
            // If button and editor share a common code-runner container, attach as well
            const common = btn.closest('.slidev-code-runner-container') || btn.closest('.slidev-code-runner-input')
            if (common && common.contains(editorEl)) {
              btn.dataset.p5codeId = sketchInstanceId.value
            }
          }
        }
      }
    } catch (e) {
      void 0
    }
  })
  // Add Monaco/editor-specific message handling
  messageHandlerFn.value = createMessageHandler()
  window.addEventListener('message', messageHandlerFn.value)
  // Also listen for direct p5-error messages to surface error UI immediately
  // All message types routed through messageHandler via `createMessageHandler`
})

// Dismiss errors when component unmounts
onBeforeUnmount(() => {
  errorMessage.value = null
})

onBeforeUnmount(() => {
  cleanupP5()
  if (resizeHandler) resizeHandler.stop()
  if (messageHandlerFn.value) {
    // Remove with the same function reference that was added
    window.removeEventListener('message', messageHandlerFn.value)
    messageHandlerFn.value = null
    messageHandler.value = null
  }
  if (unregisterMonacoRunner) unregisterMonacoRunner()
})

defineExpose({
  cleanup: cleanupP5,
  getP5Instance: () => iframeWindow.value?.p5?.instance,
  executeInIframe,
  getIframeWindow: () => iframeWindow.value,
  getMessageHandler: () => messageHandler.value,
})
</script>

<style scoped>
.p5-canvas-wrapper {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  min-height: 600px;
}

.p5-canvas-wrapper.side-by-side {
  flex-direction: row !important;
  align-items: stretch;
  min-height: 500px;
}

.p5-editor-container {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

.p5-canvas-wrapper.side-by-side .p5-editor-container {
  flex: 0 0 50%;
  width: 50%;
  min-width: 50%;
}

.p5-canvas-container {
  flex: 0 0 auto;
  min-height: 400px;
  width: 100%;
}

.p5-canvas-wrapper.side-by-side .p5-canvas-container {
  flex: 0 0 50%;
  width: 50%;
  min-height: 500px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Isolate p5 canvas from presentation styles */
.p5-canvas-container :deep(canvas) {
  border: 1px solid #ddd;
  background: white;
  display: block;
  margin: 0 auto;
  max-width: 100%;
}

.p5-canvas-iframe {
  width: 100%;
  height: auto;
  min-height: 300px;
  border: none !important;
  padding: 0 !important;
  margin: 0 !important;
  box-shadow: none !important;
  outline: none !important;
}
</style>
