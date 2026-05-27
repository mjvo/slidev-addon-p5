// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { getIframeConsoleMessage, getIframeErrorMessage, handleIframeErrorMessage, pushIframeLog, registerIframeConsoleLogHandler, resetP5Iframe } from '../../setup/iframe-runtime'

describe('iframe-runtime helpers', () => {
  it('normalizes console payloads and preserves sketch ids', () => {
    expect(getIframeConsoleMessage({
      level: 'warn',
      args: ['hello'],
      sketchInstanceId: 'sketch-1',
    })).toEqual({
      level: 'warn',
      args: ['hello'],
      sketchInstanceId: 'sketch-1',
    })
  })

  it('extracts error text from either error or message payloads', () => {
    expect(getIframeErrorMessage({ error: 'boom', sketchInstanceId: 'abc' })).toEqual({
      message: 'boom',
      sketchInstanceId: 'abc',
    })
    expect(getIframeErrorMessage({ message: 'fallback' })).toEqual({
      message: 'fallback',
      sketchInstanceId: undefined,
    })
  })

  it('caps iframe logs to the most recent 1000 entries', () => {
    const logs: Array<{ level?: string; args?: unknown[]; sketchInstanceId?: string; ts?: string }> = []

    for (let i = 0; i < 1005; i += 1) {
      pushIframeLog(logs, { level: 'log', args: [i] })
    }

    expect(logs).toHaveLength(1000)
    expect(logs[0]?.args).toEqual([5])
    expect(logs.at(-1)?.args).toEqual([1004])
  })

  it('registers iframe console payloads into the shared log list', () => {
    const logs: Array<{ level?: string; args?: unknown[]; sketchInstanceId?: string; ts?: string }> = []
    let registeredHandler: ((data: unknown) => void) | null = null
    const messageHandler = {
      registerHandler: vi.fn((_type: string, handler: (data: unknown) => void) => {
        registeredHandler = handler
      }),
    }

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      registerIframeConsoleLogHandler(messageHandler, logs)
      registeredHandler?.({ level: 'warn', args: ['from iframe'], sketchInstanceId: 'sketch-2' })
    } finally {
      consoleSpy.mockRestore()
    }

    expect(messageHandler.registerHandler).toHaveBeenCalledWith('p5-console', expect.any(Function))
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      level: 'warn',
      args: ['from iframe'],
      sketchInstanceId: 'sketch-2',
    })
  })

  it('handles iframe errors only for the active sketch id', () => {
    const logs: Array<{ level?: string; args?: unknown[]; sketchInstanceId?: string; ts?: string }> = []
    const setError = vi.fn()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      expect(handleIframeErrorMessage({
        data: { message: 'stale error', sketchInstanceId: 'old-sketch' },
        expectedSketchInstanceId: 'active-sketch',
        logs,
        setError,
      })).toBe(false)

      expect(handleIframeErrorMessage({
        data: { error: 'active error', sketchInstanceId: 'active-sketch' },
        expectedSketchInstanceId: 'active-sketch',
        logs,
        setError,
      })).toBe(true)
    } finally {
      consoleSpy.mockRestore()
    }

    expect(setError).toHaveBeenCalledTimes(1)
    expect(setError).toHaveBeenCalledWith('active error')
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      level: 'error',
      args: ['active error'],
      sketchInstanceId: 'active-sketch',
    })
  })

  it('rejects iframe setup when a dependency script recorded a load failure', async () => {
    const iframe = document.createElement('iframe') as HTMLIFrameElement & { __baseHtml?: string }
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: {
        __p5Addon: {
          dependencyErrors: ['Failed to load iframe dependency script: https://example.test/missing.js'],
        },
      },
    })
    window.setTimeout(() => iframe.dispatchEvent(new Event('load')), 0)

    await expect(resetP5Iframe({
      iframe,
      sketchInstanceId: 'dependency-error',
    })).rejects.toThrow('Failed to load iframe dependency script: https://example.test/missing.js')
  })
})
