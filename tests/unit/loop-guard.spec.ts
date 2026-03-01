import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { instrumentLoops } from '../../setup/loop-guard'

describe('instrumentLoops', () => {
  it('instruments while/for/do-while/for-in/for-of loops', () => {
    const source = `
      while (false) {}
      for (let i = 0; i < 1; i += 1) {}
      do {} while (false)
      for (const k in { a: 1 }) {}
      for (const v of [1, 2]) {}
    `
    const out = instrumentLoops(source, { timeoutMs: 100, sketchId: 'spec-a' })

    expect(out).toContain('__lpStart0')
    expect(out).toContain('__lpStart1')
    expect(out).toContain('__lpStart2')
    expect(out).toContain('__lpStart3')
    expect(out).toContain('__lpStart4')
    expect(out).toContain('Date.now()')
    expect(out).toContain('Infinite loop protection triggered')
  })

  it('instruments nested loops independently', () => {
    const source = `
      for (let i = 0; i < 2; i += 1) {
        while (false) {}
      }
    `
    const out = instrumentLoops(source)
    expect(out).toContain('__lpStart0')
    expect(out).toContain('__lpStart1')
  })

  it('returns original code when no loops are present', () => {
    const source = 'const x = 1 + 2'
    const out = instrumentLoops(source)
    expect(out).toBe(source)
  })

  it('returns original code on parse failure (fail-open)', () => {
    const source = 'function () {'
    const out = instrumentLoops(source)
    expect(out).toBe(source)
  })

  it('throws deterministic timeout error message at runtime', () => {
    const source = 'while (true) {}'
    const out = instrumentLoops(source, { timeoutMs: 3, sketchId: 'spec-timeout' })

    const DateMock = {
      now: (() => {
        let t = 0
        return () => {
          t += 2
          return t
        }
      })(),
    }

    expect(() => {
      vm.runInNewContext(out, { Date: DateMock, Error }, { timeout: 1000 })
    }).toThrow('Infinite loop protection triggered at line 1, column 0 (sketch: spec-timeout).')
  })
})

