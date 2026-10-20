import { describe, expect, test } from 'claude-code/testing'

import type { DbCall, Engine } from '../../../types/fleet'
import { reviseQuality } from './revise-quality'

const requirements = { requirements: [{ kind: '機能', change: '新', who: '経理担当は', can: '予算を承認できる', tests: [{ act: '予算を承認する', evidence: '一覧に載る' }] }] }
const check = { ship: 'requirement', of: '経理担当は、予算を承認できる', name: '予算を承認する', outcome: '合格', saw: '一覧に載った' }
const world = (docs: Record<string, object>) => {
  const calls: DbCall[] = []
  const engine = {
    now: async () => 0,
    fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role: 'qa' }),
    db: async (_url: string, call: DbCall) => {
      calls.push(call)
      const data = docs[`${call.collection}/${call.doc_id}`]
      return { text: call.action === 'get' && data ? JSON.stringify({ id: call.doc_id, data, version: 2 }) : '' }
    },
  } as unknown as Engine
  return { engine, calls }
}

describe('revise-quality', () => {
  test('requirement の成果物にあるケースへ結果を書く。付帯情報は持ち込まない', async () => {
    const { engine, calls } = world({ 'fleet/requirement/deliverables/requirements': requirements })
    expect(await reviseQuality.run(engine, { checks: [{ ...check, extra: 'x' }] })).toEqual({ result: 'QualityRevised' })
    expect(calls.at(-1)).toEqual({ action: 'set', collection: 'fleet/qa/deliverables', doc_id: 'quality', data: { checks: [{ ...check, at: '1970-01-01T00:00:00.000Z' }], findings: [], charters: [] } })
  })

  test('ケースがまだなければ、結果は書かない', async () => {
    const { engine, calls } = world({})
    expect(await reviseQuality.run(engine, { checks: [check] })).toEqual({ deny: 'requirement に「経理担当は、予算を承認できる」はない。あるのは: なし' })
    expect(calls.some(call => call.action === 'set')).toBe(false)
  })
})
