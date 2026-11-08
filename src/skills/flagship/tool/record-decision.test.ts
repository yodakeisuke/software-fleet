import { describe, expect, test } from 'claude-code/testing'

import type { DbCall, Engine } from '../../../types/fleet'
import { JsonSchema } from '../../../fleet/schema/json-schema'
import { recordDecision } from './record-decision'

// 書いた先と中身と返事。書かずに拒んだら deny
const written = async (input: unknown) => {
  const calls: DbCall[] = []
  const engine = {
    now: async () => 1700000000000,
    fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role: 'flagship' }),
    db: async (_url: string, call: DbCall) => { calls.push(call); return { text: call.action === 'get' ? '' : 'ok' } },
  } as unknown as Engine
  const reply = await recordDecision.run(engine, input)
  const set = calls.find(call => call.action === 'set')
  return 'deny' in reply ? reply : { at: `${set?.collection}/${set?.doc_id}`, data: set?.data, result: reply.result }
}
const shape = (input: unknown) => JsonSchema.check(recordDecision.spec.inputSchema, input).either(() => '', e => e)

describe('record-decision', () => {
  test('決定を新しい文書として書き、id を返す（supersedes に使える）', async () => {
    const decision = { what: '承認は 2 段にする', why: '監査要件', closes: 'ask-1', evidence: 'https://github.com/o/r/pull/12', supersedes: 'decision-1699999999999' }
    expect(await written(decision)).toEqual({ at: 'fleet/flagship/decisions/decision-1700000000000', data: { ...decision, at: '2023-11-14T22:13:20.000Z' }, result: 'DecisionRecorded(id: decision-1700000000000)' })
  })

  test('evidence はポインタだけ: URL・commit の SHA・DB の文書の id は通り、文章は拒む', () => {
    const base = { what: 'w', why: 'y' }
    for (const evidence of ['https://claude.ai/artifact/abc', 'a1f3c9e', 'fleet/ships/links/coder']) expect(shape({ ...base, evidence })).toBe('')
    expect(shape({ ...base, evidence: 'coder が言っていたから' })).toMatch(/^入力\.evidence は .* に合わない$/)
  })

  test('supersedes は決定の id だけ', () => {
    expect(shape({ what: 'w', why: 'y', supersedes: 'ask-1' })).toMatch(/^入力\.supersedes は .* に合わない$/)
  })
})
