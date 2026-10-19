import { describe, expect, test } from 'claude-code/testing'

import type { Behavior, BehaviorChanges, Moment, ReadModel, View } from '../../../types/fleet'
import { EventModel } from './event-model'

// 既存（既）の時点とリードモデル。例が要らないので、並べ方だけを見られる
const moment = (command: string, event: string): Moment => ({
  change: '既', by: { kind: 'screen', actor: '申請者', screen: '申請フォーム', sketch: '[申請する]' }, reads: [],
  command: { name: command, params: [] }, aggregate: '経費', events: [{ name: event, attrs: [] }], otherwise: [], tests: [],
})
const readModel = (name: string): ReadModel => ({ change: '既', name, fields: ['金額'], sources: ['経費が申請された'], tests: [] })
const view = (screen: string): View => ({ change: '既', actor: '経理担当', screen, sketch: '一覧', reads: [], at: '経費を申請する' })
const model = (parts: Partial<Behavior>): Behavior => ({ ...EventModel.empty(), ...parts })
const apply = moment('経費を申請する', '経費が申請された')
const approve = moment('経費を承認する', '経費が承認された')
const pay = moment('経費を支払う', '経費が支払われた')
const revised = (current: Behavior, changes: BehaviorChanges) => EventModel.revise(current, changes).either<unknown>(next => next, error => error)
const commands = (next: unknown) => (next as Behavior).moments.map(m => m.command.name)

describe('event-model', () => {
  test('時点は、足すと after の直後（省けば先頭）に、直すとその場で、消すと取り除く。今のコマンド名で指す', () => {
    const start = model({ moments: [apply, pay] })
    expect(commands(revised(start, { moments: [{ op: 'add', after: '経費を申請する', to: approve }] }))).toEqual(['経費を申請する', '経費を承認する', '経費を支払う'])
    expect(commands(revised(start, { moments: [{ op: 'add', to: approve }] }))).toEqual(['経費を承認する', '経費を申請する', '経費を支払う'])
    expect(commands(revised(start, { moments: [{ op: 'replace', which: '経費を支払う', to: approve }] }))).toEqual(['経費を申請する', '経費を承認する'])
    expect(commands(revised(start, { moments: [{ op: 'remove', which: '経費を申請する' }] }))).toEqual(['経費を支払う'])
  })

  test('流れは本流のコマンドから分かれ、自分の軸を持つ。直すと中の時点は残り、消すと中の時点ごと消える', () => {
    const retry = moment('申請をやり直す', '申請がやり直された')
    const branched = revised(model({ moments: [apply] }), { flows: [{ op: 'add', to: { name: '差し戻し', from: '経費を申請する' } }], moments: [{ op: 'add', flow: '差し戻し', to: retry }] }) as Behavior
    expect(branched.flows).toEqual([{ name: '差し戻し', from: '経費を申請する', moments: [retry] }])
    expect((revised(branched, { flows: [{ op: 'replace', which: '差し戻し', to: { name: '差し戻しの再申請', from: '経費を申請する' } }] }) as Behavior).flows[0]?.moments).toEqual([retry])
    expect((revised(branched, { moments: [{ op: 'replace', which: '申請をやり直す', to: { ...retry, change: '新', tests: [] } }] }) as string)).toContain('「申請をやり直す」に「申請がやり直された」を起こす例がない')
    expect((revised(branched, { flows: [{ op: 'remove', which: '差し戻し' }] }) as Behavior).flows).toEqual([])
  })

  test('画面・リードモデル・問いは、足すと末尾に、直すとその場で、消すと取り除く。名乗りは渡すと置き換える', () => {
    const start = model({ moments: [apply], views: [view('申請一覧')], readModels: [readModel('申請一覧'), readModel('支払予定')], hotspots: [{ question: '上限は？', assumption: '10万円' }] })
    expect((revised(start, { readModels: [{ op: 'add', to: readModel('承認待ち') }] }) as Behavior).readModels.map(r => r.name)).toEqual(['申請一覧', '支払予定', '承認待ち'])
    expect((revised(start, { views: [{ op: 'replace', which: '申請一覧', to: view('申請の履歴') }] }) as Behavior).views.map(v => v.screen)).toEqual(['申請の履歴'])
    expect((revised(start, { hotspots: [{ op: 'remove', which: '上限は？' }] }) as Behavior).hotspots).toEqual([])
    expect((revised(start, { identity: { unit: '1 回の申請', key: '申請ID' } }) as Behavior).identity).toEqual({ unit: '1 回の申請', key: '申請ID' })
  })

  test('見つからなければ、今ある鍵を全部挙げて、何も変えない', () => {
    expect(revised(model({ moments: [apply], readModels: [readModel('申請一覧')] }), { moments: [{ op: 'remove', which: '経費を返す' }], readModels: [{ op: 'remove', which: '返金一覧' }] }))
      .toBe('見つからない: 時点「経費を返す」、リードモデル「返金一覧」。今あるもの: 時点 「経費を申請する」 / 画面 なし / リードモデル 「申請一覧」 / 流れ なし / 問い なし')
    expect(revised(model({}), { moments: [{ op: 'add', flow: '差し戻し', to: approve }] })).toContain('見つからない: 流れ「差し戻し」')
    // 足す after は、入れる軸の時点を指す。ほかの軸の時点（分かれ元など）を指したら、探した軸を言う
    const flowed = model({ moments: [apply], flows: [{ name: '差し戻し', from: '経費を申請する', moments: [pay] }] })
    expect(revised(flowed, { moments: [{ op: 'add', flow: '差し戻し', after: '経費を申請する', to: approve }] })).toContain('見つからない: 流れ「差し戻し」の時点「経費を申請する」')
    expect(revised(flowed, { moments: [{ op: 'add', after: '経費を支払う', to: approve }] })).toContain('見つからない: 本流の時点「経費を支払う」')
  })

  test('盤面の問題（軸・参照・例）は全部を 1 つの文にして返す', () => {
    expect(revised(model({ moments: [apply] }), { moments: [{ op: 'add', after: '経費を申請する', to: { ...approve, events: [] } }, { op: 'add', to: apply }] }))
      .toBe('コマンド「経費を申請する」が重なっている / 同じ軸の事実「経費が申請された」が重なっている / 「経費を承認する」が起こす事実がない')
    expect(revised(model({ moments: [apply] }), { views: [{ op: 'add', to: { ...view('申請一覧'), reads: ['承認待ち'] } }] })).toBe('画面「申請一覧」が読む「承認待ち」がリードモデルにない')
  })

  test('変更の記録には、何をいくつ足し・直し・消したかを書く', () => {
    expect(EventModel.changed({ moments: [{ op: 'add', to: apply }, { op: 'remove', which: 'x' }], hotspots: [{ op: 'replace', which: 'q', to: { question: 'q', assumption: 'a' } }], identity: { unit: 'u', key: 'k' } }))
      .toBe('時点 +1 ~0 -1 / 問い +0 ~1 -0 / 名乗り')
    expect(EventModel.changed({})).toBe('')
  })
})
