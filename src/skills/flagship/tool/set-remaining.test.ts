import { describe, expect, test } from 'claude-code/testing'

import type { DbCall, Engine } from '../../../types/fleet'
import { setRemaining } from './set-remaining'

// 書いた先と中身。書かずに拒んだら deny
const written = async (input: unknown) => {
  const calls: DbCall[] = []
  const engine = {
    fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role: 'flagship' }),
    db: async (_url: string, call: DbCall) => { calls.push(call); return { text: call.action === 'get' ? '' : 'ok' } },
  } as unknown as Engine
  const reply = await setRemaining.run(engine, input)
  const set = calls.find(call => call.action === 'set')
  return 'deny' in reply ? reply : { at: `${set?.collection}/${set?.doc_id}`, data: set?.data }
}

describe('set-remaining', () => {
  test('残りの塊を、止めている判断と一緒に、今の全体で置き換える', async () => {
    const chunks = [{ what: '承認経路の実装', blockedBy: ['ask-1'] }, { what: 'QA 証跡' }]
    expect(await written({ chunks })).toEqual({ at: 'fleet/flagship/deliverables/remaining', data: { chunks } })
  })

  test('塊が多すぎれば書かずに拒む', async () => {
    const chunks = Array.from({ length: 8 }, (_, k) => ({ what: `作業 ${k}` }))
    expect(await written({ chunks })).toEqual({ deny: 'chunks は 7 件まで（今 8 件）。細かい作業は大きな塊にまとめる' })
  })
})
