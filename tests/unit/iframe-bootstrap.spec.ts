import { describe, expect, it, vi } from 'vitest'
import { buildP5IframeHtml, measureCanvasDisplaySize } from '../../setup/iframe-bootstrap'

describe('iframe-bootstrap', () => {
  it('renders provided script URLs into the iframe head in order', () => {
    const html = buildP5IframeHtml({
      computedBg: 'rgba(255, 255, 255, 1)',
      theme: 'light',
      sketchInstanceId: 'test-sketch',
      scriptUrls: [
        'https://cdn.example.com/p5.min.js',
        '/vendor/ml5.min.js',
        './local-plugin.js',
      ],
    })

    const firstIndex = html.indexOf('<script src="https://cdn.example.com/p5.min.js"></script>')
    const secondIndex = html.indexOf('<script src="/vendor/ml5.min.js"></script>')
    const thirdIndex = html.indexOf('<script src="./local-plugin.js"></script>')

    expect(firstIndex).toBeGreaterThan(-1)
    expect(secondIndex).toBeGreaterThan(firstIndex)
    expect(thirdIndex).toBeGreaterThan(secondIndex)
  })

  it('installs dependency load error reporting before external scripts execute', () => {
    const html = buildP5IframeHtml({
      computedBg: 'rgba(255, 255, 255, 1)',
      theme: 'light',
      sketchInstanceId: 'error-sketch',
      scriptUrls: ['/missing-library.js'],
    })

    const reporterIndex = html.indexOf('Failed to load iframe dependency script:')
    const scriptIndex = html.indexOf('<script src="/missing-library.js"></script>')

    expect(reporterIndex).toBeGreaterThan(-1)
    expect(reporterIndex).toBeLessThan(scriptIndex)
    expect(html).toContain(`window.__p5Addon.sketchInstanceId = "error-sketch";`)
    expect(html).toContain('window.__p5Addon.dependencyErrors.push(message);')
    expect(html).toContain(`type: 'p5-error'`)
  })

  it('prefers intended display size over a shrunken offsetWidth measurement', () => {
    const canvas = {
      style: {
        width: '400px',
        height: '400px',
      },
      width: 800,
      height: 800,
      offsetWidth: 200,
      offsetHeight: 400,
      clientWidth: 200,
      clientHeight: 400,
      getBoundingClientRect: vi.fn(() => ({
        width: 200,
        height: 400,
        top: 0,
        left: 0,
        right: 200,
        bottom: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })),
    } as unknown as HTMLCanvasElement

    const measured = measureCanvasDisplaySize(canvas, {
      devicePixelRatio: 2,
      getComputedStyle: vi.fn(() => ({
        width: '200px',
        height: '400px',
      } as CSSStyleDeclaration)),
    })
    expect(measured).toEqual({ width: 400, height: 400 })
  })
})
