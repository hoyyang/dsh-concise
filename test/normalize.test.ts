import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDigestHref, normalizeDigestText } from '../src/client/normalize.ts'

test('normalizeDigestHref strips trailing bold markers and pct-encoded CJK punctuation', () => {
  // 实证坏链形态（job 自查会话）
  assert.equal(
    normalizeDigestHref('https://feishu.cn/wiki/REDACTEDTOKEN**%E3%80%82'),
    'https://feishu.cn/wiki/REDACTEDTOKEN',
  )
  // 字面星号与字面句读混合
  assert.equal(normalizeDigestHref('https://a.com/x**。'), 'https://a.com/x')
  assert.equal(normalizeDigestHref('https://a.com/x**'), 'https://a.com/x')
  assert.equal(normalizeDigestHref('https://a.com/x%2A%2A'), 'https://a.com/x')
})

test('normalizeDigestHref keeps clean URLs untouched (no-op on standard links)', () => {
  assert.equal(normalizeDigestHref('https://feishu.cn/wiki/abc'), 'https://feishu.cn/wiki/abc')
  // 中间（非尾部）的星号/括号合法保留
  assert.equal(normalizeDigestHref('https://a.com/a*b(c).html'), 'https://a.com/a*b(c).html')
  assert.equal(normalizeDigestHref('https://a.com/search?q=x*y'), 'https://a.com/search?q=x*y')
})

test('normalizeDigestHref fails safe on degenerate input', () => {
  // 全部是垃圾字符时回退原值，绝不返回空/无 scheme 的 href
  assert.equal(normalizeDigestHref('**%E3%80%82'), '**%E3%80%82')
  assert.equal(normalizeDigestHref(''), '')
})

test('normalizeDigestText strips trailing markers from link label', () => {
  assert.equal(normalizeDigestText('https://a.com/x**。'), 'https://a.com/x')
  assert.equal(normalizeDigestText('文档**。'), '文档')
  assert.equal(normalizeDigestText('干净文字'), '干净文字')
})
