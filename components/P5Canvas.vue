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
  // Find the #slide-content element for background detection
  let slideEl = document.getElementById('slide-content')
  const htmlRoot = document.documentElement
  // Initial theme guess from Slidev root classes
  let theme = 'light'
  if (htmlRoot.classList.contains('slidev-theme-dark')) theme = 'dark'
  if (htmlRoot.classList.contains('slidev-theme-light')) theme = 'light'

  // Helpers: parse simple color formats (hex, rgb, rgba) and resolve CSS vars
  const parseColor = (input: string | null): { r: number; g: number; b: number; a: number } | null => {
    if (!input) return null
    let s = input.trim().toLowerCase()
    // handle CSS var references like var(--foo)
    const varMatch = s.match(/^var\((--[a-z0-9-_]+)\)$/i)
    if (varMatch) {
      const val = getComputedStyle(htmlRoot).getPropertyValue(varMatch[1]).trim()
      if (val) s = val.toLowerCase()
    }
    // rgb/rgba
    const rgbMatch = s.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\s*\)/)
    if (rgbMatch) {
      return {
        r: Number(rgbMatch[1]),
        g: Number(rgbMatch[2]),
        b: Number(rgbMatch[3]),
        a: rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 1,
      }
    }
    // hex #rrggbb or #rgb
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
    // named colors / other formats are not handled here
    return null
  }

  const composite = (fg: { r: number; g: number; b: number; a: number }, bg: { r: number; g: number; b: number; a: number }) => {
    const fa = fg.a
    const ba = bg.a
    const outA = fa + ba * (1 - fa)
    if (outA === 0) return { r: 0, g: 0, b: 0, a: 0 }
    const r = (fg.r * fa + bg.r * ba * (1 - fa)) / outA
    const g = (fg.g * fa + bg.g * ba * (1 - fa)) / outA
    const b = (fg.b * fa + bg.b * ba * (1 - fa)) / outA
    return { r, g, b, a: outA }
  }

  // Walk up DOM to resolve layered backgrounds and composite alpha
  const resolveBackground = (el: Element | null): { r: number; g: number; b: number; a: number } | null => {
    let curr: Element | null = el
    let accumulated: { r: number; g: number; b: number; a: number } | null = null
    while (curr && curr.nodeType === 1) {
      try {
        const style = getComputedStyle(curr as Element)
        let bg = style.backgroundColor || style.background || ''
        bg = bg && bg !== 'initial' ? bg : ''
        let parsed = parseColor(bg || null)
        // if background is provided via CSS variable (e.g. --bg)
        if ((!parsed || parsed.a === 0) && typeof style.getPropertyValue === 'function') {
          const varNames = ['--slide-background','--slidev-background','--background','--bg','--background-color','--vp-background']
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
          if (!accumulated) {
            accumulated = parsed
          } else {
            accumulated = composite(parsed, accumulated)
          }
          // if fully opaque, we can stop
          if (accumulated.a >= 0.999) break
        }
      } catch (e) {
        // ignore and continue up
      }
      curr = curr.parentElement
    }
    return accumulated
  }

  let resolved = null as { r: number; g: number; b: number; a: number } | null
  if (slideEl) {
    const style = getComputedStyle(slideEl)
    const direct = parseColor(style.backgroundColor || style.background || null)
    if (direct && direct.a && direct.a > 0) {
      resolved = direct
    } else {
      // try common CSS vars then walk ancestors
      const varNames = ['--slide-background','--slidev-background','--background','--bg','--background-color','--vp-background']
      for (const name of varNames) {
        const val = style.getPropertyValue(name)
        if (val) {
          const p = parseColor(val.trim())
          if (p && p.a > 0) { resolved = p; break }
        }
      }
      if (!resolved) resolved = resolveBackground(slideEl)
    }
  }

  if (!resolved) {
    resolved = theme === 'dark' ? { r: 24, g: 24, b: 26, a: 1 } : { r: 255, g: 255, b: 255, a: 1 }
  }

  // Final computed background as rgba string
  const computedBg = `rgba(${Math.round(resolved.r)}, ${Math.round(resolved.g)}, ${Math.round(resolved.b)}, ${Number(resolved.a.toFixed(3))})`
  // Update theme guess from resolved background luminance
  const luminance = (0.2126 * resolved.r + 0.7152 * resolved.g + 0.0722 * resolved.b) / 255
  theme = luminance < 0.5 ? 'dark' : 'light'
  const p5LoadUrl = getP5LoadUrl({ version: props.p5Version, cdnUrl: props.p5CdnUrl })
  sketchInstanceId.value = createSketchId()
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="${p5LoadUrl}"><\/script>
      <style>
        html, body { margin: 0; padding: 0; overflow: hidden; background: ${computedBg}; display: flex; justify-content: center; align-items: center; }
        canvas { display: block; }
        #p5-container { display: flex; justify-content: center; align-items: center; }
      </style>
    </head>
    <body>
        <div id="p5-container"></div>
        <script>
        window.__p5Addon = {};
        window.__p5Addon.logs = [];
        window.__p5Addon.sketchInstanceId = '${sketchInstanceId.value}';
        window.__p5Addon.theme = '${theme}';
        let lastWidth = 0;
        let lastHeight = 0;
        const parentOrigin = (function(){
          try {
            if (document.referrer) return new URL(document.referrer).origin;
            if (window.location.ancestorOrigins && window.location.ancestorOrigins.length) return window.location.ancestorOrigins[0];
          } catch (e) {
            void 0
          }
          return window.location.origin;
        })();

        const resizeIframe = () => {
          const canvas = document.querySelector('canvas');
          if (canvas) {
            const width = canvas.offsetWidth + 4;
            const height = canvas.offsetHeight + 4;
            if (width > 10 && height > 10 && (width !== lastWidth || height !== lastHeight)) {
              lastWidth = width;
              lastHeight = height;
              window.parent.postMessage({ type: 'p5-resize', width: width, height: height, sketchInstanceId: window.__p5Addon.sketchInstanceId }, parentOrigin);
            }
          }
        };
        const observer = new MutationObserver(() => { setTimeout(resizeIframe, 100); });
        observer.observe(document.body, { childList: true, subtree: true });
        setInterval(resizeIframe, 500);
        window.parent.postMessage({ type: 'p5-iframe-ready', sketchInstanceId: window.__p5Addon.sketchInstanceId }, parentOrigin);
        window.parent.postMessage({ type: 'p5-iframe-ready', sketchInstanceId: window.__p5Addon.sketchInstanceId }, parentOrigin);
      <\/script>
    </body>
    </html>
  `
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
