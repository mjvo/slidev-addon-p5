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

  it('rewrites media constants for createCapture to instance namespace', () => {
    const code = `function setup(){ createCapture(VIDEO); }`
    const out = transpileGlobalToInstance(code)
    expect(out).toBeTruthy()
    expect(out).toContain(`${P5_NAMESPACE}.createCapture(${P5_NAMESPACE}.VIDEO)`)
  })

  it('rewrites newer p5 2.2+ shader and geometry globals to instance namespace', () => {
    const code = `
      function setup() {
        const shader = buildFilterShader('void main() {}')
        const material = baseMaterialShader()
        const geom = buildGeometry(() => {
          beginClip()
          box(20)
          endClip()
        })
        const modelData = createModel()
        const col = paletteLerp(['#000', '#fff'], 0.5)
        metalness(0.4)
        strokeShader(shader)
        imageShader(shader)
        loadFilterShader('/filter.frag')
        loadBlob('/asset.bin')
      }
    `
    const out = transpileGlobalToInstance(code)
    expect(out).toBeTruthy()
    expect(out).toContain(`${P5_NAMESPACE}.buildFilterShader`)
    expect(out).toContain(`${P5_NAMESPACE}.baseMaterialShader`)
    expect(out).toContain(`${P5_NAMESPACE}.buildGeometry`)
    expect(out).toContain(`${P5_NAMESPACE}.beginClip`)
    expect(out).toContain(`${P5_NAMESPACE}.endClip`)
    expect(out).toContain(`${P5_NAMESPACE}.createModel`)
    expect(out).toContain(`${P5_NAMESPACE}.paletteLerp`)
    expect(out).toContain(`${P5_NAMESPACE}.metalness`)
    expect(out).toContain(`${P5_NAMESPACE}.strokeShader`)
    expect(out).toContain(`${P5_NAMESPACE}.imageShader`)
    expect(out).toContain(`${P5_NAMESPACE}.loadFilterShader`)
    expect(out).toContain(`${P5_NAMESPACE}.loadBlob`)
  })

})
