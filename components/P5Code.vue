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
        :allow="iframeAllow"
      />
      <P5LogPanel :logs="iframeLogs" />
    </div>
  </div>
</template>

<script setup lang="ts">
/* eslint-disable no-useless-escape */
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import P5ErrorBoundary from './P5ErrorBoundary.vue'
import P5LogPanel from './P5LogPanel.vue'
import { createSketchId } from '../setup/id'
import type { CSSProperties } from 'vue'
import { IframeMessageHandler } from '../setup/iframe-message-handler'
import { IframeResizeHandler } from '../setup/iframe-resize-handler'
import { getP5ScriptUrls } from '../setup/p5-version-manager'
import { resetIframeToBaseHtml, safeRemoveP5, stopP5SoundPlayback } from '../setup/p5-utils'
import { applyThemeToIframeDocument, buildP5IframeHtml, computeIframeBackgroundTheme } from '../setup/iframe-bootstrap'
import { SECURITY_CONFIG } from '../setup/config'
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
  p5SoundVersion?: string // Optional p5.sound version (defaults to latest tested)
  p5SoundCdnUrl?: string // Custom CDN URL for p5.sound
  enableP5Sound?: boolean // Set false to skip loading p5.sound
}

const props = withDefaults(defineProps<Props>(), {
  displayOnly: false,
  p5Version: undefined,  // Use latest stable version
  p5CdnUrl: undefined,   // Use CDN URL determined by version
  p5SoundVersion: undefined, // Use latest tested p5.sound
  p5SoundCdnUrl: undefined, // Use CDN URL determined by version
  enableP5Sound: false, // Load p5.sound only when explicitly enabled
})

const iframeElement = ref<HTMLIFrameElement>()
const iframeWindow = ref<Window | null>(null)
const iframeAllow = SECURITY_CONFIG.iframeAllow
const iframeReady = ref(false)  // Track if iframe has initialized
const errorMessage = ref<string | null>(null)
const iframeLogs = ref<Array<{ level?: string; args?: unknown[]; sketchInstanceId?: string; ts?: string }>>([])
const messageHandler = ref<IframeMessageHandler | null>(null)  // Handler for iframe messages (Monaco/editor-specific)
const messageHandlerFn = ref<((event: MessageEvent) => void) | null>(null)  // Stable function reference for addEventListener/removeEventListener
let resizeHandler: IframeResizeHandler | null = null
const sketchInstanceId = ref<string>(createSketchId())

// Note: message routing is delegated to `IframeMessageHandler` via `messageHandlerFn` below.

interface SlidevGlobalLike {
  registerCodeRunner?: (runner: { language: string; options?: Record<string, unknown> }) => (() => void) | undefined
}

// Monaco code-runner registration
let unregisterMonacoRunner: (() => void) | null = null
let monacoRegisterRetryTimer: ReturnType<typeof setInterval> | null = null
let themeObserver: MutationObserver | null = null
let themeSyncFrame: number | null = null

const registerMonacoRunner = (): boolean => {
  if (unregisterMonacoRunner) return true
  try {
    const globals = window as unknown as { __monaco?: unknown; __slidev?: SlidevGlobalLike }
    const monacoGlobal = globals.__monaco
    const slidevGlobal = globals.__slidev
    if (!monacoGlobal || !slidevGlobal || typeof slidevGlobal.registerCodeRunner !== 'function') {
      return false
    }
    const unregister = slidevGlobal.registerCodeRunner({
      language: 'js',
      options: { sketchInstanceId: sketchInstanceId.value },
    })
    if (typeof unregister === 'function') {
      unregisterMonacoRunner = unregister
      return true
    }
  } catch (e) {
    // ignore in non-Slidev environments
  }
  return false
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
const initializeIframe = async () => {
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

  // Determine p5.js CDN URL based on version prop
  const p5ScriptUrls = getP5ScriptUrls({
    version: props.p5Version,
    cdnUrl: props.p5CdnUrl,
    soundVersion: props.p5SoundVersion,
    soundCdnUrl: props.p5SoundCdnUrl,
    includeSound: props.enableP5Sound,
  })
  const { computedBg, theme } = computeIframeBackgroundTheme({
    preferredSelector: '.slidev-page, .slidev-page-main, .slidev-page-content',
  })
  const html = buildP5IframeHtml({
    computedBg,
    theme,
    sketchInstanceId: sketchInstanceId.value,
    p5ScriptUrls,
    includeOriginalConsole: true,
    includeThemeOnAddon: true,
    includeBodyTextColor: true,
  })
  ;(iframe as HTMLIFrameElement & { __baseHtml?: string }).__baseHtml = html

  await resetIframeToBaseHtml(iframe as HTMLIFrameElement & { __baseHtml?: string })

  iframeWindow.value = iframe.contentWindow
}

const syncIframeTheme = () => {
  if (!iframeWindow.value) return
  const iframeDoc = iframeWindow.value.document
  const { computedBg, theme } = computeIframeBackgroundTheme({
    preferredSelector: '.slidev-page, .slidev-page-main, .slidev-page-content',
  })
  applyThemeToIframeDocument(iframeDoc, computedBg, theme, { includeBodyTextColor: true })
}

const scheduleIframeThemeSync = () => {
  if (themeSyncFrame !== null) {
    cancelAnimationFrame(themeSyncFrame)
  }
  themeSyncFrame = window.requestAnimationFrame(() => {
    themeSyncFrame = null
    syncIframeTheme()
  })
}

const startThemeObserver = () => {
  if (themeObserver) return
  themeObserver = new MutationObserver(() => {
    scheduleIframeThemeSync()
  })
  const observerOptions = {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  }
  themeObserver.observe(document.documentElement, observerOptions)
  if (document.body) {
    themeObserver.observe(document.body, observerOptions)
  }
}

const stopThemeObserver = () => {
  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
  if (themeSyncFrame !== null) {
    cancelAnimationFrame(themeSyncFrame)
    themeSyncFrame = null
  }
}

// Register message handlers to collect logs/errors for UI panel
const registerLogHandlers = () => {
  try {
    if (!messageHandler.value) return
    messageHandler.value.registerHandler('p5-console', (data: unknown) => {
      try {
        const d = data as { level?: string; args?: unknown[]; sketchInstanceId?: string }
        const level = (d && d.level) ? d.level : 'log'
        const args = (d && Array.isArray(d.args)) ? d.args : []
        // also mirror to parent console
        // eslint-disable-next-line no-console
        console[level] ? console[level]('[iframe p5]', ...args) : console.log('[iframe p5]', ...args)
        iframeLogs.value.push({ level, args, sketchInstanceId: d.sketchInstanceId, ts: new Date().toISOString() })
        if (iframeLogs.value.length > 1000) iframeLogs.value.splice(0, iframeLogs.value.length - 1000)
      } catch (e) { /* ignore */ }
    })
  } catch (e) { /* ignore */ }
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
  stopP5SoundPlayback(iframeWindow.value)
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
  const { computedBg, theme } = computeIframeBackgroundTheme({
    preferredSelector: '.slidev-page, .slidev-page-main, .slidev-page-content',
  })
  const html = buildP5IframeHtml({
    computedBg,
    theme,
    sketchInstanceId: sketchInstanceId.value,
    p5ScriptUrls: getP5ScriptUrls({
      version: props.p5Version,
      cdnUrl: props.p5CdnUrl,
      soundVersion: props.p5SoundVersion,
      soundCdnUrl: props.p5SoundCdnUrl,
      includeSound: props.enableP5Sound,
    }),
    includeOriginalConsole: true,
  })
  ;(iframeElement.value as HTMLIFrameElement & { __baseHtml?: string }).__baseHtml = html

  await resetIframeToBaseHtml(iframeElement.value as HTMLIFrameElement & { __baseHtml?: string })
  iframeWindow.value = iframeElement.value.contentWindow
  if (!iframeWindow.value) return { error: 'Iframe not ready after reset' }
  scheduleIframeThemeSync()

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
  stopP5SoundPlayback(iframeWindow.value)
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
  if (!registerMonacoRunner()) {
    let attempts = 0
    monacoRegisterRetryTimer = setInterval(() => {
      attempts += 1
      if (registerMonacoRunner() || attempts >= 20) {
        if (monacoRegisterRetryTimer) {
          clearInterval(monacoRegisterRetryTimer)
          monacoRegisterRetryTimer = null
        }
      }
    }, 150)
  }

  // Always initialize iframe (DOM fallback removed)
  void initializeIframe()
  startThemeObserver()
  scheduleIframeThemeSync()

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
        iframeLogs.value.push({ level: 'error', args: [String(msg)], sketchInstanceId: d?.sketchInstanceId, ts: new Date().toISOString() })
        if (iframeLogs.value.length > 1000) iframeLogs.value.splice(0, iframeLogs.value.length - 1000)
      } catch (e) {
        errorMessage.value = String(data)
        iframeLogs.value.push({ level: 'error', args: [String(data)], sketchInstanceId: sketchInstanceId.value, ts: new Date().toISOString() })
        if (iframeLogs.value.length > 1000) iframeLogs.value.splice(0, iframeLogs.value.length - 1000)
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
  registerLogHandlers()
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
  stopThemeObserver()
  if (resizeHandler) resizeHandler.stop()
  if (messageHandlerFn.value) {
    // Remove with the same function reference that was added
    window.removeEventListener('message', messageHandlerFn.value)
    messageHandlerFn.value = null
    messageHandler.value = null
  }
  if (monacoRegisterRetryTimer) {
    clearInterval(monacoRegisterRetryTimer)
    monacoRegisterRetryTimer = null
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
