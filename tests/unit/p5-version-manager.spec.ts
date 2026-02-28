import { describe, it, expect } from 'vitest'
import {
  LATEST_P5_SOUND_VERSION,
  LATEST_P5_VERSION,
  getP5LoadUrl,
  getP5ScriptUrls,
  getP5SoundLoadUrl,
} from '../../setup/p5-version-manager'

describe('p5-version-manager', () => {
  it('returns latest p5 URL by default', () => {
    expect(getP5LoadUrl()).toBe(`https://cdn.jsdelivr.net/npm/p5@${LATEST_P5_VERSION}/lib/p5.min.js`)
  })

  it('does not return p5.sound URL by default', () => {
    expect(getP5SoundLoadUrl()).toBeUndefined()
  })

  it('builds p5-only script URL list by default', () => {
    expect(getP5ScriptUrls()).toEqual([
      `https://cdn.jsdelivr.net/npm/p5@${LATEST_P5_VERSION}/lib/p5.min.js`,
    ])
  })

  it('includes p5.sound when explicitly enabled', () => {
    expect(getP5SoundLoadUrl({ includeSound: true }))
      .toBe(`https://cdn.jsdelivr.net/npm/p5.sound@${LATEST_P5_SOUND_VERSION}/dist/p5.sound.min.js`)
    expect(getP5ScriptUrls({ includeSound: true })).toEqual([
      `https://cdn.jsdelivr.net/npm/p5@${LATEST_P5_VERSION}/lib/p5.min.js`,
      `https://cdn.jsdelivr.net/npm/p5.sound@${LATEST_P5_SOUND_VERSION}/dist/p5.sound.min.js`,
    ])
  })

  it('supports disabling p5.sound explicitly', () => {
    expect(getP5ScriptUrls({ includeSound: false })).toEqual([
      `https://cdn.jsdelivr.net/npm/p5@${LATEST_P5_VERSION}/lib/p5.min.js`,
    ])
  })

  it('respects custom p5.sound URL override', () => {
    expect(getP5SoundLoadUrl({ includeSound: true, soundCdnUrl: 'https://example.com/custom-sound.js' }))
      .toBe('https://example.com/custom-sound.js')
  })
})
