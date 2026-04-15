import { SECURITY_CONFIG } from './config'
import { buildP5IframeHtml, computeIframeBackgroundTheme, type IframeBackgroundOptions } from './iframe-bootstrap'
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

const MAX_IFRAME_LOGS = 1000

export const getAllowedMessageOrigins = (): string[] => {
  return Array.from(new Set([window.location.origin, ...SECURITY_CONFIG.allowedOrigins]))
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
