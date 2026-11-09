import { describe, expect, test } from 'claude-code/testing'

import type { DbCall, Engine } from '../../../types/fleet'
import { JsonSchema } from '../../../fleet/schema/json-schema'
import { reviseBehavior } from './revise-behavior'

const moment = {
  change: '新', by: { kind: 'screen', actor: '申請者', screen: '申請フォーム', sketch: '金額 [____]\n[申請する]' }, reads: [],
  command: { name: '経費を申請する', params: ['金額'] }, aggregate: '経費', events: [{ name: '経費が申請された', attrs: ['金額'] }], otherwise: [],
  tests: [{ name: '申請される', given: [], when: { 金額: '3万円' }, expect: [{ event: '経費が申請された', values: { 金額: '3万円' } }] }],
}
const empty = { moments: [], views: [], readModels: [], flows: [], hotspots: [] }
const shape = (input: unknown) => JsonSchema.check(reviseBehavior.spec.inputSchema, { note: '試す', ...(input as object) }).either<unknown>(() => '', e => e)
// DB の中身（"collection/id" ごと）を持つ engine。呼び出しを calls に残す
const engineWith = (stored: Record<string, object>, calls: DbCall[]) => ({
  fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role: 'behavior' }),
  now: async () => 1000,
  db: async (_url: string, call: DbCall) => {
    calls.push(call)
    const doc = stored[`${call.collection}/${call.doc_id}`]
    return { text: call.action === 'get' && doc ? `{"id":"${call.doc_id}","data":${JSON.stringify(doc)},"version":3}` : 'ok' }
  },
}) as unknown as Engine

describe('revise-behavior', () => {
  test('revise_behavior の形: 時点を起こすのは画面・agent・規則で、例の expect は事実の並びか error。値は文字列。理由（note）は要る', () => {
    expect(shape({ moments: [{ op: 'add', to: moment }] })).toBe('')
    expect(shape({ moments: [{ op: 'add', to: { ...moment, by: { kind: 'policy', rule: '申請されたら知らせる' } } }] })).toBe('入力.moments[0].to.by.on がない')
    expect(shape({ moments: [{ op: 'add', to: { ...moment, by: { kind: 'human' } } }] })).toBe('入力.moments[0].to.by は kind: screen | kind: agent | kind: policy のどれかの形')
    expect(shape({ moments: [{ op: 'add', to: { ...moment, tests: [{ ...moment.tests[0], expect: 'rejected' }] } }] })).toBe('入力.moments[0].to.tests[0].expect は error のどれか')
    expect(shape({ moments: [{ op: 'add', to: { ...moment, tests: [{ ...moment.tests[0], when: { 金額: 30000 } }] } }] })).toBe('入力.moments[0].to.tests[0].when.金額 は string でなければならない')
    expect(shape({ hotspots: [{ op: 'add', to: { question: '上限は？' } }], flows: [{ op: 'remove' }] })).toBe('入力.flows[0].which がない / 入力.hotspots[0].to.assumption がない')
    expect(JsonSchema.check(reviseBehavior.spec.inputSchema, {}).either<unknown>(() => '', e => e)).toBe('入力.note がない')
  })

  test('盤面を直し、理由を変更の記録に残す。付帯情報は持ち込まない', async () => {
    const calls: DbCall[] = []
    const input = { note: '申請を足す', moments: [{ op: 'add', to: { ...moment, extra: 'x' } }], tool: 'mcp__software-fleet__revise_behavior' }
    expect(await reviseBehavior.run(engineWith({}, calls), input)).toEqual({ result: 'BehaviorRevised' })
    expect(calls.filter(call => call.action === 'set')).toEqual([
      { action: 'set', collection: 'fleet/behavior/deliverables', doc_id: 'event-model', data: { ...empty, moments: [moment] } },
      { action: 'set', collection: 'fleet/behavior/journal', doc_id: 'entry-1000', data: { note: '申請を足す', changed: '時点 +1 ~0 -0', at: '1970-01-01T00:00:01.000Z' } },
    ])
  })

  test('ユーザのコメントに返信する。返信だけなら盤面は書かない。無いコメントや、id に / を含むコメントには返信しない', async () => {
    const calls: DbCall[] = []
    const stored = { 'fleet/user/comments/comment-1': { ship: 'behavior', on: 'm:経費を申請する', text: '上限は？', at: 'x' } }
    expect(await reviseBehavior.run(engineWith(stored, calls), { note: '上限は会社の事実なので問いにした', replies: [{ comment: 'comment-1', reply: '問いに立てました' }] })).toEqual({ result: 'BehaviorRevised' })
    expect(calls.filter(call => call.action === 'set').map(call => `${call.collection}/${call.doc_id}`)).toEqual(['fleet/behavior/journal/entry-1000', 'fleet/behavior/replies/comment-1'])
    expect(await reviseBehavior.run(engineWith(stored, []), { note: 'x', replies: [{ comment: 'comment-9', reply: 'y' }] })).toEqual({ deny: '返信先のコメントがない: comment-9' })
    const nested = { ...stored, 'fleet/user/comments/a/b': { ship: 'behavior', on: 'm:経費を申請する', text: 'x', at: 'x' } }
    expect(await reviseBehavior.run(engineWith(nested, []), { note: 'x', replies: [{ comment: 'a/b', reply: 'y' }] })).toEqual({ deny: '入力.replies[0].comment は ^[\\w-]+$ に合わない' })
  })

  test('盤面を書いた後で変更の記録や返信を書けなければ、盤面は戻さずに、書けなかったものを返す', async () => {
    const calls: DbCall[] = []
    const stored = { 'fleet/user/comments/comment-1': { ship: 'behavior', on: 'm:経費を申請する', text: '上限は？', at: 'x' } }
    const base = engineWith(stored, calls)
    const engine = { ...base, db: async (url: string, call: DbCall) => (call.action === 'set' && call.doc_id !== 'event-model' ? { text: 'quota_exceeded', isError: true as const } : base.db(url, call)) } as Engine
    expect(await reviseBehavior.run(engine, { note: '申請を足す', moments: [{ op: 'add', to: moment }], replies: [{ comment: 'comment-1', reply: '足しました' }] }))
      .toEqual({ result: 'BehaviorRevised。ただし書けなかった: 変更の記録（quota_exceeded）、返信 comment-1（quota_exceeded）' })
    expect(calls.filter(call => call.action === 'set' && call.doc_id === 'event-model')).toHaveLength(1)
  })

  test('盤面に問題があれば何も書かず、全部を返す', async () => {
    const calls: DbCall[] = []
    const stored = { 'fleet/behavior/deliverables/event-model': { ...empty, moments: [moment] } }
    expect(await reviseBehavior.run(engineWith(stored, calls), { note: '重ねる', moments: [{ op: 'add', to: moment }] }))
      .toEqual({ deny: 'コマンド「経費を申請する」が重なっている / 同じ軸の事実「経費が申請された」が重なっている' })
    expect(calls.map(call => call.action)).toEqual(['get'])
  })
})
