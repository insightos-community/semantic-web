import { describe, expect, it } from 'vitest'
import {
  displayPropertyText,
  formatPropertyText,
  INSPECTOR_MAX_CHARS,
  shouldExpandProperty,
  summarizeProperty
} from '@/studio/inspectorProperty'

describe('inspectorProperty', () => {
  it('短标量不展开，对象和长文本展开', () => {
    expect(shouldExpandProperty('ok')).toBe(false)
    expect(shouldExpandProperty({ a: 1 })).toBe(true)
    expect(shouldExpandProperty('x'.repeat(81))).toBe(true)
    expect(summarizeProperty({ a: 1, b: 2 })).toBe('对象 · 2 个字段')
    expect(summarizeProperty(['a', 'b'])).toBe('数组 · 2 项')
    expect(formatPropertyText({ a: 1 })).toContain('"a": 1')
  })

  it('超长正文按 32KB 截断', () => {
    const value = '汉'.repeat(INSPECTOR_MAX_CHARS + 4)
    const display = displayPropertyText(value)
    expect(display.truncated).toBe(true)
    expect(display.text.endsWith('…（已截断）')).toBe(true)
  })
})
