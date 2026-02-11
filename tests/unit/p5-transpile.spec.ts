import { describe, it, expect } from 'vitest'
import { transpileGlobalToInstance, P5_NAMESPACE } from '../../setup/p5-transpile'

describe('transpileGlobalToInstance', () => {
  it('converts setup and createCanvas to instance mode', () => {
    const code = `function setup(){ createCanvas(200, 100); }`
    const out = transpileGlobalToInstance(code)
    expect(out).toBeTruthy()
    expect(out).toContain(`${P5_NAMESPACE}.setup`)
    expect(out).toContain(`${P5_NAMESPACE}.createCanvas`)
  })

  it('prefixes variables with underscore and uses them in draw', () => {
    const code = `let counter = 0; function draw(){ counter++; }`
    const out = transpileGlobalToInstance(code)
    expect(out).toBeTruthy()
    expect(out).toContain('_counter')
    expect(out).toContain(`${P5_NAMESPACE}.draw`)
  })

  it('rewrites p5 global function calls to instance namespace', () => {
    const code = `function setup(){ const c = color(255,0,0); }`
    const out = transpileGlobalToInstance(code)
    expect(out).toBeTruthy()
    expect(out).toContain(`${P5_NAMESPACE}.color`)
  })

  it('does not mutate object literal keys when renaming variables', () => {
    const code = `let size = 10; const obj = { size: 1 };`
    const out = transpileGlobalToInstance(code)
    expect(out).toBeTruthy()
    expect(out).toMatch(/\{\s*size:\s*1\s*\}/)
    expect(out).toContain('let _size = 10')
  })

  it('expands shorthand properties to keep keys stable', () => {
    const code = `let size = 10; const obj = { size };`
    const out = transpileGlobalToInstance(code)
    expect(out).toBeTruthy()
    expect(out).toMatch(/\{\s*size:\s*_size\s*\}/)
  })

  it('transforms arrow lifecycle functions into instance mode', () => {
    const code = `const setup = () => { createCanvas(100, 100); }`
    const out = transpileGlobalToInstance(code)
    expect(out).toBeTruthy()
    expect(out).toContain(`${P5_NAMESPACE}.setup`)
  })
})
