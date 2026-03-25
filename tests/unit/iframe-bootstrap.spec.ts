import { describe, expect, it } from 'vitest'
import { buildP5IframeHtml } from '../../setup/iframe-bootstrap'

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
})
