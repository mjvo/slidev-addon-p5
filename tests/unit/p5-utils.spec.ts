import { describe, it, expect, vi } from 'vitest'
import { stopP5SoundPlayback } from '../../setup/p5-utils'

describe('stopP5SoundPlayback', () => {
  it('returns 0 when iframe window is missing', () => {
    expect(stopP5SoundPlayback(null)).toBe(0)
    expect(stopP5SoundPlayback(undefined)).toBe(0)
  })

  it('stops and disconnects unique sound objects from p5.sound arrays', () => {
    const stopA = vi.fn()
    const disconnectA = vi.fn()
    const stopB = vi.fn()
    const disconnectB = vi.fn()
    const soundA = { stop: stopA, disconnect: disconnectA }
    const soundB = { stop: stopB, disconnect: disconnectB }
    const fakeWindow = {
      p5: { soundOut: { soundArray: [soundA, soundB] } },
      soundOut: { soundArray: [soundA] }, // duplicate reference should not double stop
    } as unknown as Window

    const count = stopP5SoundPlayback(fakeWindow)
    expect(count).toBe(2)
    expect(stopA).toHaveBeenCalledTimes(1)
    expect(disconnectA).toHaveBeenCalledTimes(1)
    expect(stopB).toHaveBeenCalledTimes(1)
    expect(disconnectB).toHaveBeenCalledTimes(1)
  })

  it('swallows per-source failures and continues', () => {
    const bad = {
      stop: vi.fn(() => { throw new Error('boom') }),
      disconnect: vi.fn(() => { throw new Error('boom') }),
    }
    const goodStop = vi.fn()
    const goodDisconnect = vi.fn()
    const good = { stop: goodStop, disconnect: goodDisconnect }
    const fakeWindow = {
      p5: { soundOut: { soundArray: [bad, good] } },
    } as unknown as Window

    const count = stopP5SoundPlayback(fakeWindow)
    expect(count).toBe(1)
    expect(goodStop).toHaveBeenCalledTimes(1)
    expect(goodDisconnect).toHaveBeenCalledTimes(1)
  })
})
