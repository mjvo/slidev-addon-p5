import { describe, expect, it } from 'vitest'
import { getShaderDslBridgeScript } from '../../setup/p5-shader-dsl'

describe('p5-shader-dsl bridge', () => {
  it('bridges shader helpers to the active p5 instance without touching unrelated names', () => {
    const script = getShaderDslBridgeScript('_p')

    expect(script).toContain('window.mix = (...args) => _p.mix(...args);')
    expect(script).toContain('window.getColor = (...args) => _p.getColor(...args);')
    expect(script).toContain('window.uniformFloat = (...args) => _p.uniformFloat(...args);')
    expect(script).not.toContain('window.createCanvas')
  })
})
