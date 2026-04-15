import { describe, expect, it } from 'vitest'
import { getIframeConsoleMessage, getIframeErrorMessage, pushIframeLog } from '../../setup/iframe-runtime'

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
})
