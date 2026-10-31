import { describe, expect, test } from 'claude-code/testing'

import type { DbCall, Engine, Role } from '../../types/fleet'
import { reviseDocument } from './revise-document'

const section = { heading: '手順', blocks: [{ kind: 'steps', items: ['押す'] }] }
// 書いた先と中身。書かずに拒んだら deny
const written = async (role: Role, input: unknown) => {
  const calls: DbCall[] = []
  const engine = {
    fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role }),
    db: async (_url: string, call: DbCall) => { calls.push(call); return { text: call.action === 'get' ? '' : 'ok' } },
  } as unknown as Engine
  const reply = await reviseDocument.run(engine, input)
  const set = calls.find(call => call.action === 'set')
  return 'deny' in reply ? reply : { at: `${set?.collection}/${set?.doc_id}`, data: set?.data }
}

describe('revise-document', () => {
  test('章を文書ごとの置き場所に書く', async () => {
    const changes = [{ op: 'add', section }]
    expect(await written('cs', { document: 'guide', title: '題', changes })).toEqual({ at: 'fleet/cs/deliverables/guide', data: { title: '題', sections: [section] } })
    expect(await written('cs', { document: 'decisionLog', changes })).toEqual({ at: 'fleet/cs/deliverables/decision-log', data: { sections: [section] } })
    expect(await written('ops', { document: 'operationsDesign', changes })).toEqual({ at: 'fleet/ops/deliverables/operations-design', data: { sections: [section] } })
  })

  test('持ち主でなければ書かずに拒む', async () => {
    expect(await written('ops', { document: 'guide', changes: [] })).toEqual({ deny: 'guide を書けるのは cs だけ' })
  })

  test('folded は真偽値だけを通す', async () => {
    expect(await written('cs', { document: 'guide', changes: [{ op: 'add', section: { ...section, folded: true } }] })).toHaveProperty('at')
    expect(await written('cs', { document: 'guide', changes: [{ op: 'add', section: { ...section, folded: 'yes' } }] })).toHaveProperty('deny')
  })

  test('決まった部品でなければ書かずに拒む', async () => {
    const reply = await written('cs', { document: 'guide', changes: [{ op: 'add', section: { heading: '手順', blocks: [{ kind: 'html', html: '<p>' }] } }] })
    expect(reply).toHaveProperty('deny')
  })
})
