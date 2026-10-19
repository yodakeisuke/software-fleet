import { describe, expect, test } from 'claude-code/testing'

import { Remaining } from './remaining'

const chunks = (n: number) => Array.from({ length: n }, (_, k) => ({ what: `塊 ${k + 1}` }))
const error = (n: number) => Remaining.of({ chunks: chunks(n) }).either(() => '', e => e)

describe('remaining', () => {
  test('残りは大きな塊で 7 件まで。残りがなければ空でよい', () => {
    expect(error(0)).toBe('')
    expect(error(7)).toBe('')
    expect(error(8)).toBe('chunks は 7 件まで（今 8 件）。細かい作業は大きな塊にまとめる')
  })
})
