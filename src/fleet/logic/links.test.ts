import { describe, expect, test } from 'claude-code/testing'

import { Links } from './links'

const error = (label: string) => Links.of({ links: [{ url: 'https://example.com/a', label }] }).either(() => '', e => e)

describe('links', () => {
  test('ボタンの文言は 20 文字まで。文字数はコードポイントで数える', () => {
    expect(error('あ'.repeat(20))).toBe('')
    expect(error('😀'.repeat(20))).toBe('')
    expect(error('あ'.repeat(21))).toBe('links[0].label は 20 文字まで（今 21 文字）')
  })

  test('リンクがなければ空でよい', () => {
    expect(Links.of({ links: [] }).either(() => '', e => e)).toBe('')
  })
})
