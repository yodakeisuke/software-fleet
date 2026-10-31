import { describe, expect, test } from 'claude-code/testing'

import type { DbCall, Engine } from '../../../types/fleet'
import { setPullRequest } from './set-pull-request'

// 書いた先と中身。書かずに拒んだら deny
const written = async (input: unknown) => {
  const calls: DbCall[] = []
  const engine = {
    fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role: 'implementation' }),
    db: async (_url: string, call: DbCall) => { calls.push(call); return { text: call.action === 'get' ? '' : 'ok' } },
  } as unknown as Engine
  const reply = await setPullRequest.run(engine, input)
  const set = calls.find(call => call.action === 'set')
  return 'deny' in reply ? reply : { at: `${set?.collection}/${set?.doc_id}`, data: set?.data }
}

describe('set-pull-request', () => {
  test('PR の URL を implementation の成果物として書く', async () => {
    const url = 'https://github.com/owner/repo/pull/12'
    expect(await written({ url })).toEqual({ at: 'fleet/implementation/deliverables/pull-request', data: { url } })
  })

  test('PR の URL でなければ書かずに拒む', async () => {
    expect(await written({ url: 'javascript:alert(1)' })).toEqual({ deny: 'GitHub の PR の URL ではない: javascript:alert(1)' })
  })
})
