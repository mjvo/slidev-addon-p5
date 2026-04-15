import { describe, it, expect } from 'vitest'
import {
  getExtraScriptUrls,
  getSupportedVersions,
  LATEST_P5_SOUND_VERSION,
  LATEST_P5_VERSION,
  getP5LoadUrl,
  getP5ScriptUrls,
  getP5SoundLoadUrl,
  normalizeExtraScriptUrl,
} from '../../setup/p5-version-manager'

describe('p5-version-manager', () => {
  it('returns latest p5 URL by default', () => {
    expect(getP5LoadUrl()).toBe(`https://cdn.jsdelivr.net/npm/p5@${LATEST_P5_VERSION}/lib/p5.min.js`)
  })

  it('exposes the validated latest version first in the supported list', () => {
    expect(LATEST_P5_VERSION).toBe('2.2.2')
    expect(getSupportedVersions()[0]).toBe('2.2.2')
    expect(getSupportedVersions()).toContain('2.2.0')
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

  it('appends validated extra scripts after p5 dependencies', () => {
    expect(getP5ScriptUrls({
      includeSound: true,
      externalP5Libs: [
        '/vendor/ml5.min.js',
        'https://example.com/extra-plugin.js',
      ],
    })).toEqual([
      `https://cdn.jsdelivr.net/npm/p5@${LATEST_P5_VERSION}/lib/p5.min.js`,
      `https://cdn.jsdelivr.net/npm/p5.sound@${LATEST_P5_SOUND_VERSION}/dist/p5.sound.min.js`,
      '/vendor/ml5.min.js',
      'https://example.com/extra-plugin.js',
    ])
  })

  it('deduplicates extra script URLs while preserving order', () => {
    expect(getExtraScriptUrls({
      externalP5Libs: [
        '/vendor/ml5.min.js',
        '/vendor/ml5.min.js',
        ' https://example.com/a.js ',
        'https://example.com/a.js',
        './relative-lib.js',
      ],
    })).toEqual([
      '/vendor/ml5.min.js',
      'https://example.com/a.js',
      './relative-lib.js',
    ])
  })

  it('allows https, localhost, and relative script URLs', () => {
    expect(normalizeExtraScriptUrl('https://example.com/lib.js'))
      .toBe('https://example.com/lib.js')
    expect(normalizeExtraScriptUrl('http://localhost:4173/dev-lib.js'))
      .toBe('http://localhost:4173/dev-lib.js')
    expect(normalizeExtraScriptUrl('../vendor/lib.js'))
      .toBe('../vendor/lib.js')
  })

  it('rejects unsupported script URL schemes and hosts', () => {
    expect(() => normalizeExtraScriptUrl('javascript:alert(1)'))
      .toThrow(/Unsupported script URL protocol/i)
    expect(() => normalizeExtraScriptUrl('data:text/javascript,alert(1)'))
      .toThrow(/Unsupported script URL protocol/i)
    expect(() => normalizeExtraScriptUrl('http://example.com/lib.js'))
      .toThrow(/Use https, localhost\/127.0.0.1, or a relative URL/i)
    expect(() => getExtraScriptUrls({ externalP5Libs: [''] }))
      .toThrow(/non-empty strings/i)
  })
})
