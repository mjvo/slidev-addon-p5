<template>
  <div
    class="p5-canvas-wrapper"
    :style="wrapperStyle"
  >
    <P5ErrorBoundary
      v-if="errorMessage"
      :message="errorMessage"
      @clear="errorMessage = null"
    />
    <iframe
      ref="iframeElement"
      class="p5-canvas-iframe"
      :title="`p5.js Canvas`"
      :allow="iframeAllow"
    />
    <P5LogPanel :logs="iframeLogs" />
  </div>
</template>

<script setup lang="ts">
/* eslint-disable no-useless-escape */
import { ref, onMounted, computed, nextTick, onBeforeUnmount } from 'vue'
import type { CSSProperties } from 'vue'
import { createSketchId } from '../setup/id'
import { transpileGlobalToInstance } from '../setup/p5-transpile'
import { instrumentLoops } from '../setup/loop-guard'
import { SECURITY_CONFIG, TIMING_CONFIG } from '../setup/config'
import { safeRemoveP5, stopP5SoundPlayback } from '../setup/p5-utils'
import { getShaderDslBridgeScript } from '../setup/p5-shader-dsl'

import { IframeResizeHandler } from '../setup/iframe-resize-handler'
import { IframeMessageHandler } from '../setup/iframe-message-handler'
import P5ErrorBoundary from './P5ErrorBoundary.vue'
import P5LogPanel from './P5LogPanel.vue'
import { createIframeThemeSyncController, getAllowedMessageOrigins, handleIframeErrorMessage, registerIframeConsoleLogHandler, resetIframePresentation, resetP5Iframe, type P5IframeLogEntry } from '../setup/iframe-runtime'

import { useSlots, onUpdated } from 'vue'
const props = withDefaults(defineProps<{
  code?: string
  p5Version?: string
  p5CdnUrl?: string
  p5SoundVersion?: string
  p5SoundCdnUrl?: string
  enableP5Sound?: boolean
  externalP5Libs?: string[]
}>(), {
  code: undefined,
  p5Version: undefined,
  p5CdnUrl: undefined,
  p5SoundVersion: undefined,
  p5SoundCdnUrl: undefined,
  enableP5Sound: false,
  externalP5Libs: undefined,
})
const slots = useSlots()
const slotCode = ref<string | null>(null)
const iframeElement = ref<HTMLIFrameElement>()
const iframeWindow = ref<Window | null>(null)
const errorMessage = ref<string | null>(null)
const iframeAllow = SECURITY_CONFIG.iframeAllow
let resizeHandler: IframeResizeHandler | null = null
let messageHandler: IframeMessageHandler | null = null
let messageHandlerFn: ((event: MessageEvent) => void) | null = null
const iframeLogs = ref<P5IframeLogEntry[]>([])
const sketchInstanceId = ref<string>(createSketchId())
const allowedMessageOrigins = getAllowedMessageOrigins()
const themeSync = createIframeThemeSyncController({
  getWindow: () => iframeWindow.value,
  preferredElementId: 'slide-content',
})

const wrapperStyle = computed(() => ({
  display: 'flex',
  flexDirection: 'column' as CSSProperties['flexDirection'],
  gap: '1rem',
  width: '100%',
  minHeight: '400px',
}))

async function initializeIframe() {
  if (!iframeElement.value) return
  resetIframePresentation(iframeElement.value, { clearMinWidth: true })
  sketchInstanceId.value = createSketchId()
  iframeWindow.value = await resetP5Iframe({
    iframe: iframeElement.value as HTMLIFrameElement & { __baseHtml?: string },
    sketchInstanceId: sketchInstanceId.value,
    version: props.p5Version,
    cdnUrl: props.p5CdnUrl,
    soundVersion: props.p5SoundVersion,
    soundCdnUrl: props.p5SoundCdnUrl,
    includeSound: props.enableP5Sound,
    externalP5Libs: props.externalP5Libs,
    preferredElementId: 'slide-content',
    readyMessageCount: 2,
    requirePositiveCanvasSize: true,
    includeThemeOnAddon: true,
  })
}

// Message routing will be handled by `IframeMessageHandler` instance registered below.


function extractCodeFromSlot(): string | null {
  // No debug logs
  // Recursively search for <code> VNode and extract its text content
    const findCode = (vnode: unknown, depth = 0): string | null => {
      if (!vnode) return null
      const vn = vnode as { type?: unknown; children?: unknown }
      if (vn.type && String(vn.type).includes('code')) {
        if (typeof vn.children === 'string') return vn.children.trim()
        if (Array.isArray(vn.children) && typeof vn.children[0] === 'string') return (vn.children[0] as string).trim()
      }
      if (Array.isArray(vn.children)) {
        for (const child of vn.children as unknown[]) {
          const found = findCode(child, depth + 1)
          if (found) return found
        }
      }
    return null
  }
  const vnodes = slots.default ? slots.default() : []
  try {
    for (let i = 0; i < vnodes.length; i++) {
      const vnode = vnodes[i]
      // Handle Slidev CodeBlockWrapper: children is { default: function }
      if (vnode && vnode.children && typeof vnode.children === 'object' && 'default' in vnode.children && typeof vnode.children.default === 'function') {
        const codeVNodes = vnode.children.default()
        const arr = Array.isArray(codeVNodes) ? codeVNodes : [codeVNodes]
        const collectAllStrings = (vnArr: unknown[]): string[] => {
          let result: string[] = []
          for (const v of vnArr) {
            if (!v) continue
            const vv = v as { children?: unknown }
            if (typeof vv.children === 'string') {
              result.push(vv.children)
            } else if (Array.isArray(vv.children)) {
              result = result.concat(collectAllStrings(vv.children))
            } else if (vv.children && typeof vv.children === 'object' && vv.children !== v) {
              result = result.concat(collectAllStrings([vv.children]))
            }
          }
          return result
        }
        const allStrings = collectAllStrings(arr)
        if (allStrings.length > 0) {
          return allStrings.join('').trim()
        }
      }
      if (typeof vnode.children === 'string') {
        const match = vnode.children.match(/```[a-zA-Z]*\n([\s\S]*?)```/)
        if (match) {
          return match[1]
        }
        return vnode.children.trim()
      }
      const found = findCode(vnode)
      if (found) {
        return found
      }
    }
  } catch (err) {
    // fail silently
  }
  return null
}

async function runP5Sketch() {
  if (!iframeWindow.value) {
    return
  }
  stopP5SoundPlayback(iframeWindow.value)
  if (iframeWindow.value.p5 && iframeWindow.value.p5.instance) {
    try {
      safeRemoveP5(iframeWindow.value.p5.instance)
    } catch (e) {
      void 0
    }
  }
  iframeWindow.value = await resetP5Iframe({
    iframe: iframeElement.value as HTMLIFrameElement & { __baseHtml?: string },
    sketchInstanceId: sketchInstanceId.value,
    version: props.p5Version,
    cdnUrl: props.p5CdnUrl,
    soundVersion: props.p5SoundVersion,
    soundCdnUrl: props.p5SoundCdnUrl,
    includeSound: props.enableP5Sound,
    externalP5Libs: props.externalP5Libs,
    preferredElementId: 'slide-content',
    readyMessageCount: 2,
    requirePositiveCanvasSize: true,
    includeThemeOnAddon: true,
  })
  if (!iframeWindow.value) return
  // Reset iframe size styles before running new sketch
  resetIframePresentation(iframeElement.value, { clearMinWidth: true })
  let codeToRun = slotCode.value || props.code || ''
  codeToRun = instrumentLoops(codeToRun, {
    timeoutMs: TIMING_CONFIG.loopGuardTimeoutMs,
    sketchId: sketchInstanceId.value,
  })
  let transpiled = ''
  try {
    transpiled = transpileGlobalToInstance(codeToRun)
  } catch (err) {
    // If transpilation fails (possibly due to instrumentation), surface error and abort run
    try { console.error('[P5Canvas] Transpile error:', err) } catch (e) { void 0 }
    errorMessage.value = `Transpile error: ${String(err)}`
    return
  }
    const shaderDslBridgeCode = getShaderDslBridgeScript('_p')
    // Inject code via blob URL to avoid eval
    try {
      const scriptContent = `
        (function(){
          function createSketch() {
            try {
              var p5Instance = new window.p5(function(p){
                const _p = p;
                ${shaderDslBridgeCode}
                ${transpiled}
              }, document.getElementById('p5-container'));
              window.__p5Addon.instance = p5Instance;
              // Expose on window.p5.instance for tooling/tests that expect it
              try { window.p5 = window.p5 || {}; window.p5.instance = p5Instance; } catch (e) { /* ignore */ }
            } catch (err) { 
              try { 
                window.parent.postMessage({ type: 'p5-error', error: (err && err.message) ? err.message : String(err), stack: (err && err.stack) ? err.stack : undefined, sketchInstanceId: window.__p5Addon.sketchInstanceId }, parentOrigin);
              } catch (e) { /* ignore */ }
            }
          }
          if (window.p5) {
            createSketch();
          } else {
            window.addEventListener('load', createSketch);
            var __p5_wait = setInterval(function(){ if(window.p5){ clearInterval(__p5_wait); createSketch(); } }, 50);
          }
        })();
      `
      const blob = new Blob([scriptContent], { type: 'text/javascript' })
      const url = URL.createObjectURL(blob)
      const scriptEl = iframeWindow.value.document.createElement('script')
      scriptEl.src = url
      // Append before awaiting so load events can fire
      iframeWindow.value.document.body.appendChild(scriptEl)
      await new Promise<void>((resolve, reject) => {
        scriptEl.onload = () => {
          try { URL.revokeObjectURL(url) } catch (e) { void 0 }
          resolve()
        }
        scriptEl.onerror = () => {
          try { URL.revokeObjectURL(url) } catch (e) { void 0 }
          reject(new Error('Failed to load injected p5 script'))
        }
      })
    } catch (e) {
      errorMessage.value = String(e)
    }
}

onMounted(() => {
  nextTick(() => {
    slotCode.value = extractCodeFromSlot()
    themeSync.start()
    themeSync.schedule()
    // Use the shared IframeResizeHandler for resize messages, passing sketchInstanceId
    resizeHandler = new IframeResizeHandler({
      allowedOrigins: allowedMessageOrigins,
      sketchInstanceId: () => sketchInstanceId.value,
      expectedSource: () => iframeElement.value?.contentWindow ?? null,
      requireSketchInstanceId: true,
      onResize: (width, height, incomingSketchId) => {
        if (incomingSketchId && incomingSketchId !== sketchInstanceId.value) {
          return;
        }
        if (width < 10 || height < 10) return;
        if (iframeElement.value) {
          iframeElement.value.style.setProperty('width', width + 'px', 'important');
          iframeElement.value.style.setProperty('height', height + 'px', 'important');
          iframeElement.value.style.setProperty('min-width', width + 'px', 'important');
          iframeElement.value.style.setProperty('min-height', height + 'px', 'important');
        }
      },
      throttleMs: 150,
    })
    resizeHandler.start()
    // Create a message handler to centralize postMessage handling
    try {
      messageHandler = new IframeMessageHandler({
        allowedOrigins: allowedMessageOrigins,
        expectedSource: () => iframeElement.value?.contentWindow ?? null,
        requireSketchInstanceId: true,
        expectedSketchInstanceId: () => sketchInstanceId.value,
        onError: (data) => {
          handleIframeErrorMessage({
            data,
            expectedSketchInstanceId: sketchInstanceId.value,
            logs: iframeLogs.value,
            setError: (message) => { errorMessage.value = message },
            logPrefix: '[iframe p5 error]',
          })
        },
        onReady: () => {},
        onResize: () => {},
      })
      registerIframeConsoleLogHandler(messageHandler, iframeLogs.value)
      messageHandlerFn = (event: MessageEvent) => { try { messageHandler?.handle(event) } catch (e) { /* ignore */ } }
      window.addEventListener('message', messageHandlerFn)
    } catch (e) {
      void 0
    }
    void initializeIframe()
      .then(() => runP5Sketch())
      .catch((error: unknown) => {
        const msg = (error as { message?: unknown } | null)?.message
        errorMessage.value = typeof msg === 'string' ? msg : String(error)
      })
  })
})

onBeforeUnmount(() => {
  stopP5SoundPlayback(iframeWindow.value)
  if (iframeWindow.value?.p5?.instance) {
    try {
      safeRemoveP5(iframeWindow.value.p5.instance)
    } catch (e) {
      void 0
    }
  }
  themeSync.stop()
  if (resizeHandler) resizeHandler.stop()
  if (messageHandlerFn) {
    window.removeEventListener('message', messageHandlerFn)
    messageHandlerFn = null
    messageHandler = null
  }
})

// Re-extract code and rerun sketch if slot content changes
onUpdated(() => {
  const newCode = extractCodeFromSlot()
  if (newCode && newCode !== slotCode.value) {
    slotCode.value = newCode
    runP5Sketch()
  }
})
</script>

<style scoped>
.p5-canvas-wrapper {
  width: 100%;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.p5-canvas-iframe {
  width: 100%;
  min-height: 300px;
  /* background: white; */
  border: none !important;
  padding: 0 !important;
  margin: 0 !important;
  box-shadow: none !important;
  outline: none !important;
}
</style>
