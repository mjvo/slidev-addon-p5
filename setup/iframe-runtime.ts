import { SECURITY_CONFIG } from './config'
import { applyThemeToIframeDocument, buildP5IframeHtml, computeIframeBackgroundTheme, type ApplyIframeThemeOptions, type IframeBackgroundOptions } from './iframe-bootstrap'
import { resetIframeToBaseHtml } from './p5-utils'
import { getP5ScriptUrls, type P5VersionConfig } from './p5-version-manager'

export interface P5IframeLogEntry {
  level?: string
  args?: unknown[]
  sketchInstanceId?: string
  ts?: string
}

interface ResetIframePresentationOptions {
  width?: string
  height?: string
  minHeight?: string
  clearMinWidth?: boolean
}

interface ResetP5IframeOptions extends P5VersionConfig, IframeBackgroundOptions {
  iframe: HTMLIFrameElement & { __baseHtml?: string }
  sketchInstanceId: string
  includeBodyTextColor?: boolean
  includeThemeOnAddon?: boolean
  includeOriginalConsole?: boolean
  readyMessageCount?: number
  requirePositiveCanvasSize?: boolean
}

interface IframeThemeSyncOptions extends IframeBackgroundOptions, ApplyIframeThemeOptions {
  getWindow: () => Window | null | undefined
}

interface IframeMessageHandlerLike {
  registerHandler: (type: string, handler: (data: unknown) => void) => void
}

interface IframeErrorHandlerOptions {
  data: unknown
  expectedSketchInstanceId?: string
  logs: P5IframeLogEntry[]
  setError: (message: string) => void
  logPrefix?: string
}

const MAX_IFRAME_LOGS = 1000

export const getAllowedMessageOrigins = (): string[] => {
  return Array.from(new Set([window.location.origin, ...SECURITY_CONFIG.allowedOrigins]))
}

export const createIframeThemeSyncController = (options: IframeThemeSyncOptions) => {
  let themeObserver: MutationObserver | null = null
  let themeSyncFrame: number | null = null

  const sync = (): void => {
    const iframeWindow = options.getWindow()
    if (!iframeWindow) return

    const { computedBg, theme } = computeIframeBackgroundTheme({
      preferredElementId: options.preferredElementId,
      preferredSelector: options.preferredSelector,
    })
    applyThemeToIframeDocument(iframeWindow.document, computedBg, theme, {
      includeBodyTextColor: options.includeBodyTextColor,
    })
  }

  const schedule = (): void => {
    if (themeSyncFrame !== null) {
      cancelAnimationFrame(themeSyncFrame)
    }
    themeSyncFrame = window.requestAnimationFrame(() => {
      themeSyncFrame = null
      sync()
    })
  }

  const start = (): void => {
    if (themeObserver) return
    themeObserver = new MutationObserver(() => {
      schedule()
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

  const stop = (): void => {
    if (themeObserver) {
      themeObserver.disconnect()
      themeObserver = null
    }
    if (themeSyncFrame !== null) {
      cancelAnimationFrame(themeSyncFrame)
      themeSyncFrame = null
    }
  }

  return { schedule, start, stop, sync }
}

export const resetIframePresentation = (
  iframe: HTMLIFrameElement | null | undefined,
  options: ResetIframePresentationOptions = {}
): void => {
  if (!iframe) return

  const {
    width = '100%',
    height = '400px',
    minHeight = '400px',
    clearMinWidth = false,
  } = options

  iframe.style.setProperty('width', width, 'important')
  iframe.style.setProperty('height', height, 'important')
  iframe.style.setProperty('min-height', minHeight, 'important')
  iframe.style.setProperty('max-height', 'none', 'important')
  iframe.style.setProperty('display', 'block', 'important')
  iframe.style.setProperty('flex', '0 0 auto', 'important')
  iframe.style.removeProperty('align-self')
  iframe.style.maxWidth = ''
  if (clearMinWidth) {
    iframe.style.minWidth = ''
  }

  const container = iframe.parentElement
  if (container) {
    container.style.minHeight = ''
    container.style.maxHeight = ''
  }
}

export const pushIframeLog = (
  logs: P5IframeLogEntry[],
  entry: Omit<P5IframeLogEntry, 'ts'> & { ts?: string }
): void => {
  logs.push({
    ...entry,
    ts: entry.ts ?? new Date().toISOString(),
  })
  if (logs.length > MAX_IFRAME_LOGS) {
    logs.splice(0, logs.length - MAX_IFRAME_LOGS)
  }
}

export const getIframeConsoleMessage = (
  data: unknown
): Required<Pick<P5IframeLogEntry, 'level' | 'args'>> & Pick<P5IframeLogEntry, 'sketchInstanceId'> => {
  const payload = data as { level?: unknown; args?: unknown; sketchInstanceId?: unknown } | null
  return {
    level: typeof payload?.level === 'string' ? payload.level : 'log',
    args: Array.isArray(payload?.args) ? payload.args : [],
    sketchInstanceId: typeof payload?.sketchInstanceId === 'string' ? payload.sketchInstanceId : undefined,
  }
}

export const getIframeErrorMessage = (
  data: unknown
): { message: string; sketchInstanceId?: string } => {
  const payload = data as { error?: unknown; message?: unknown; sketchInstanceId?: unknown } | null
  const rawMessage = payload?.error ?? payload?.message ?? data
  return {
    message: String(rawMessage),
    sketchInstanceId: typeof payload?.sketchInstanceId === 'string' ? payload.sketchInstanceId : undefined,
  }
}

export const registerIframeConsoleLogHandler = (
  messageHandler: IframeMessageHandlerLike | null | undefined,
  logs: P5IframeLogEntry[]
): void => {
  if (!messageHandler) return
  messageHandler.registerHandler('p5-console', (data: unknown) => {
    try {
      const { level, args, sketchInstanceId } = getIframeConsoleMessage(data)
      // eslint-disable-next-line no-console
      console[level] ? console[level]('[iframe p5]', ...args) : console.log('[iframe p5]', ...args)
      pushIframeLog(logs, { level, args, sketchInstanceId })
    } catch (e) {
      // Ignore malformed iframe log payloads from stale runtimes.
    }
  })
}

export const handleIframeErrorMessage = ({
  data,
  expectedSketchInstanceId,
  logs,
  setError,
  logPrefix = '[p5 addon] Error in iframe:',
}: IframeErrorHandlerOptions): boolean => {
  try {
    const details = getIframeErrorMessage(data)
    if (details.sketchInstanceId && details.sketchInstanceId !== expectedSketchInstanceId) {
      return false
    }
    setError(details.message)
    pushIframeLog(logs, { level: 'error', args: [details.message], sketchInstanceId: details.sketchInstanceId })
  } catch (e) {
    const fallbackMessage = String(data)
    setError(fallbackMessage)
    pushIframeLog(logs, { level: 'error', args: [fallbackMessage], sketchInstanceId: expectedSketchInstanceId })
  }

  // eslint-disable-next-line no-console
  console.error(logPrefix, data)
  return true
}

export const resetP5Iframe = async (options: ResetP5IframeOptions): Promise<Window | null> => {
  const {
    iframe,
    sketchInstanceId,
    includeBodyTextColor = false,
    includeThemeOnAddon = true,
    includeOriginalConsole = true,
    readyMessageCount = 1,
    requirePositiveCanvasSize = false,
    preferredElementId,
    preferredSelector,
    ...scriptOptions
  } = options

  const { computedBg, theme } = computeIframeBackgroundTheme({ preferredElementId, preferredSelector })
  iframe.__baseHtml = buildP5IframeHtml({
    computedBg,
    theme,
    sketchInstanceId,
    scriptUrls: getP5ScriptUrls(scriptOptions),
    includeBodyTextColor,
    includeThemeOnAddon,
    includeOriginalConsole,
    readyMessageCount,
    requirePositiveCanvasSize,
  })

  await resetIframeToBaseHtml(iframe)
  return iframe.contentWindow
}
