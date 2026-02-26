import { describe, it, expect } from 'vitest'
import * as runners from '../../setup/code-runners'

describe('executeInIframeContext', () => {
  it('returns error when iframe window not accessible', async () => {
    const fakeIframe = { contentWindow: null } as { contentWindow: Window | null }
    const res = await runners.executeInIframeContext(fakeIframe, 'console.log(1)')
    expect(res.success).toBeFalsy()
    expect(res.error).toMatch(/Cannot access iframe window/)
  })
})

describe('formatErrorWithLineMapping', () => {
  it('returns a string even for simple errors', () => {
    const err = new Error('test failure\n at line 3')
    const out = runners.formatErrorWithLineMapping(err, 'a=1', 'a=1')
    expect(typeof out).toBe('string')
    expect(out.length).toBeGreaterThan(0)
  })
})

describe('isLikelyP5Sketch', () => {
  it('detects top-level lifecycle hooks', () => {
    const code = `
      function setup() {
        createCanvas(300, 300)
      }
    `
    expect(runners.isLikelyP5Sketch(code)).toBeTruthy()
  })

  it('detects lifecycle assignment patterns', () => {
    const code = `
      const draw = () => {
        background(220)
      }
    `
    expect(runners.isLikelyP5Sketch(code)).toBeTruthy()
  })

  it('detects p5 constructor usage', () => {
    const code = `
      new p5((p) => {
        p.setup = () => p.createCanvas(100, 100)
      })
    `
    expect(runners.isLikelyP5Sketch(code)).toBeTruthy()
  })

  it('does not classify plain JavaScript as p5', () => {
    const code = `
      function add(a, b) {
        return a + b
      }
      add(1, 2)
    `
    expect(runners.isLikelyP5Sketch(code)).toBeFalsy()
  })
})
