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
    />
  </div>
</template>

<script setup lang="ts">
/* eslint-disable no-useless-escape */
import { ref, onMounted, computed, nextTick, onBeforeUnmount } from 'vue'
import type { CSSProperties } from 'vue'
import { createSketchId } from '../setup/id'
import { transpileGlobalToInstance } from '../setup/p5-transpile'
// Dynamic require for loop-protect to avoid bundler/runtime issues in some setups
/* eslint-disable @typescript-eslint/no-var-requires */
let loopProtect: ((code: string, opts?: Record<string, unknown>) => string) | undefined
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // @ts-expect-error -- dynamic require may not have types at build time
  const lp = require('loop-protect')
  if (typeof lp === 'function') loopProtect = lp
} catch (e) {
  void 0
}
/* eslint-enable @typescript-eslint/no-var-requires */
import { getP5LoadUrl } from '../setup/p5-version-manager'
import { buildP5IframeHtml, computeIframeBackgroundTheme } from '../setup/iframe-bootstrap'

import { IframeResizeHandler } from '../setup/iframe-resize-handler'
import { IframeMessageHandler } from '../setup/iframe-message-handler'
import P5ErrorBoundary from './P5ErrorBoundary.vue'

import { useSlots, onUpdated } from 'vue'
const props = defineProps<{ code?: string, p5Version?: string, p5CdnUrl?: string }>()
const slots = useSlots()
const slotCode = ref<string | null>(null)
const iframeElement = ref<HTMLIFrameElement>()
const iframeWindow = ref<Window | null>(null)
const errorMessage = ref<string | null>(null)
let resizeHandler: IframeResizeHandler | null = null
let messageHandler: IframeMessageHandler | null = null
let messageHandlerFn: ((event: MessageEvent) => void) | null = null
const sketchInstanceId = ref<string>(createSketchId())

const wrapperStyle = computed(() => ({
  display: 'flex',
  flexDirection: 'column' as CSSProperties['flexDirection'],
  gap: '1rem',
  width: '100%',
  minHeight: '400px',
}))

function initializeIframe() {
  if (!iframeElement.value) return
  const doc = iframeElement.value.contentDocument || iframeElement.value.contentWindow?.document
  if (!doc) return
  const { computedBg, theme } = computeIframeBackgroundTheme({ preferredElementId: 'slide-content' })
  const p5LoadUrl = getP5LoadUrl({ version: props.p5Version, cdnUrl: props.p5CdnUrl })
  sketchInstanceId.value = createSketchId()
  const html = buildP5IframeHtml({
    computedBg,
    theme,
    sketchInstanceId: sketchInstanceId.value,
    p5ScriptUrl: p5LoadUrl,
    includeThemeOnAddon: true,
    readyMessageCount: 2,
    requirePositiveCanvasSize: true,
  })
  doc.open()
  doc.write(html)
  doc.close()
  iframeWindow.value = iframeElement.value.contentWindow
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
    // eslint-disable-next-line no-console
    return
  }
  // Reset iframe size styles before running new sketch
  if (iframeElement.value) {
    iframeElement.value.style.width = 'auto';
    iframeElement.value.style.height = '400px';
    iframeElement.value.style.minWidth = '';
    iframeElement.value.style.minHeight = '';
    iframeElement.value.style.maxWidth = '';
    iframeElement.value.style.maxHeight = '';
  }
  let codeToRun = slotCode.value || props.code || ''
  // Instrument user code to prevent infinite loops when possible
  try {
    if (typeof loopProtect === 'function') {
      codeToRun = loopProtect(codeToRun, { id: `lp-${Date.now()}` })
    }
  } catch (e) {
    void 0
  }
  // eslint-disable-next-line no-console
  let transpiled = ''
  try {
    transpiled = transpileGlobalToInstance(codeToRun)
  } catch (err) {
    // If transpilation fails (possibly due to instrumentation), surface error and abort run
    try { console.error('[P5Canvas] Transpile error:', err) } catch (e) { void 0 }
    errorMessage.value = `Transpile error: ${String(err)}`
    return
  }
    // Inject code via blob URL to avoid eval
    try {
      const scriptContent = `
        (function(){
          function createSketch() {
            try {
              var p5Instance = new window.p5(function(p){
                const _p = p;
                ${transpiled}
              }, document.getElementById('p5-container'));
              window.__p5Addon.instance = p5Instance;
            } catch (err) { /* swallow user runtime errors until reported */ }
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
    // eslint-disable-next-line no-console
    // eslint-disable-next-line no-console
    slotCode.value = extractCodeFromSlot()
    // eslint-disable-next-line no-console
    initializeIframe()
    setTimeout(() => {
      // eslint-disable-next-line no-console
      runP5Sketch()
    }, 300)
    // Use the shared IframeResizeHandler for resize messages, passing sketchInstanceId
    resizeHandler = new IframeResizeHandler({
      allowedOrigins: [window.location.origin],
      sketchInstanceId: sketchInstanceId.value,
      expectedSource: () => iframeElement.value?.contentWindow ?? null,
      requireSketchInstanceId: true,
      onResize: (width, height, incomingSketchId) => {
        if (incomingSketchId && incomingSketchId !== sketchInstanceId.value) {
          return;
        }
        if (width < 10 || height < 10) return;
        if (iframeElement.value) {
          iframeElement.value.style.width = width + 'px';
          iframeElement.value.style.height = height + 'px';
          iframeElement.value.style.minWidth = width + 'px';
          iframeElement.value.style.minHeight = height + 'px';
        }
      },
      throttleMs: 150,
    })
    resizeHandler.start()
    // Create a message handler to centralize postMessage handling
    try {
      messageHandler = new IframeMessageHandler({
        allowedOrigins: [window.location.origin],
        expectedSource: () => iframeElement.value?.contentWindow ?? null,
        requireSketchInstanceId: true,
        expectedSketchInstanceId: () => sketchInstanceId.value,
        onError: (data) => {
          try {
            const d = data as { sketchInstanceId?: string; error?: unknown; message?: unknown } | null
            if (d && d.sketchInstanceId && d.sketchInstanceId !== sketchInstanceId.value) return
            const msg = (d && (d.error || d.message)) ? (d.error || d.message) : String(d)
            errorMessage.value = String(msg)
          } catch (e) {
            errorMessage.value = String(data)
          }
        },
        onReady: () => {},
        onResize: () => {},
      })
      messageHandlerFn = (event: MessageEvent) => { try { messageHandler?.handle(event) } catch (e) { /* ignore */ } }
      window.addEventListener('message', messageHandlerFn)
    } catch (e) {
      void 0
    }
  })
})

onBeforeUnmount(() => {
  if (resizeHandler) resizeHandler.stop()
  if (messageHandlerFn) {
    window.removeEventListener('message', messageHandlerFn)
    messageHandlerFn = null
    messageHandler = null
  }
})

// Re-extract code and rerun sketch if slot content changes
onUpdated(() => {
  // eslint-disable-next-line no-console
  // eslint-disable-next-line no-console
  const newCode = extractCodeFromSlot()
  // eslint-disable-next-line no-console
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
