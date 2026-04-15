// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IframeResizeHandler } from '../../setup/iframe-resize-handler'

describe('IframeResizeHandler', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('matches resize messages against the latest sketch instance id', () => {
    const onResize = vi.fn()
    let currentSketchId = 'initial-id'
    const source = window

    const handler = new IframeResizeHandler({
      allowedOrigins: [window.location.origin],
      expectedSource: () => source,
      sketchInstanceId: () => currentSketchId,
      requireSketchInstanceId: true,
      throttleMs: 0,
      onResize,
    })

    handler.start()
    currentSketchId = 'next-id'

    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      source,
      data: {
        type: 'p5-resize',
        width: 379,
        height: 379,
        sketchInstanceId: 'next-id',
      },
    }))

    handler.stop()

    expect(onResize).toHaveBeenCalledTimes(1)
    expect(onResize).toHaveBeenCalledWith(379, 379, 'next-id')
  })
})
