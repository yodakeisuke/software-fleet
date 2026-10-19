import { describe, expect, test } from 'claude-code/testing'

import type { Behavior, Moment, Trigger } from '../../../types/fleet'
import { Timeline } from './timeline'

const screen: Trigger = { kind: 'screen', actor: '申請者', screen: '申請フォーム', sketch: '[申請する]' }
const moment = (command: string, event: string, by: Trigger = screen): Moment => ({
  change: '既', by, reads: [], command: { name: command, params: [] }, aggregate: '経費', events: [{ name: event, attrs: [] }], otherwise: [], tests: [],
})
const apply = moment('経費を申請する', '経費が申請された')
const approve = moment('経費を承認する', '経費が承認された')
const notify = moment('上長に知らせる', '上長に通知された', { kind: 'policy', rule: '申請されたら上長に知らせる', on: '経費が申請された' })
const model = (parts: Partial<Behavior>): Behavior => ({ moments: [], views: [], readModels: [], flows: [], hotspots: [], ...parts })
const problems = (moments: Moment[], flows: Behavior['flows'] = []) => Timeline.problems(model({ moments, flows }))

describe('timeline', () => {
  test('コマンドは名前で指すので、本流と流れを通して、同じ名前は 1 つだけ', () => {
    expect(problems([apply], [{ name: '差し戻し', from: '経費を申請する', moments: [moment('経費を申請する', '経費が出し直された')] }]))
      .toEqual(['コマンド「経費を申請する」が重なっている'])
  })

  test('事実は盤面に名前で置くので、同じ軸の中では 1 つだけ。流れの中ではまた起きてよいが、運ぶ属性は同じ（並びは問わない）', () => {
    expect(problems([apply, moment('申請をやり直す', '経費が申請された')])).toEqual(['同じ軸の事実「経費が申請された」が重なっている'])
    const again = moment('申請をやり直す', '経費が申請された')
    expect(problems([apply], [{ name: '差し戻し', from: '経費を申請する', moments: [again] }])).toEqual([])
    const other = { ...again, events: [{ name: '経費が申請された', attrs: ['金額'] }] }
    expect(problems([apply], [{ name: '差し戻し', from: '経費を申請する', moments: [other] }])).toEqual(['事実「経費が申請された」が、時点によって違う属性を運んでいる'])
    const ordered = { ...apply, events: [{ name: '経費が申請された', attrs: ['金額', '用途'] }] }
    const reordered = { ...again, events: [{ name: '経費が申請された', attrs: ['用途', '金額'] }] }
    expect(problems([ordered], [{ name: '差し戻し', from: '経費を申請する', moments: [reordered] }])).toEqual([])
  })

  test('コマンドは事実を 1 つ以上起こす', () => {
    expect(problems([{ ...apply, events: [] }])).toEqual(['「経費を申請する」が起こす事実がない'])
  })

  test('規則と、事実に起こされる agent が聴く事実は、それより前の時点で起きる。人が頼む agent は聴かない', () => {
    expect(problems([apply, notify])).toEqual([])
    expect(problems([notify, apply])).toEqual(['「上長に知らせる」が聴く「経費が申請された」は、それより前の時点の事実ではない'])
    const triage = (on?: string): Trigger => ({ kind: 'agent', agent: '仕訳AI', task: '仕訳を起こす', sketch: '勘定科目を選ぶ', ...(on ? { on } : {}) })
    expect(problems([moment('仕訳を起こす', '仕訳が起きた', triage()), apply])).toEqual([])
    expect(problems([moment('仕訳を起こす', '仕訳が起きた', triage('経費が申請された')), apply])).toEqual(['「仕訳を起こす」が聴く「経費が申請された」は、それより前の時点の事実ではない'])
  })

  test('流れは分かれ元までの本流の続きなので、分かれ元までに起きた事実を聴ける。分かれ元より後の本流は聴けない', () => {
    expect(problems([apply, approve], [{ name: '督促', from: '経費を申請する', moments: [notify] }])).toEqual([])
    const late: Moment = { ...notify, by: { kind: 'policy', rule: '承認されたら知らせる', on: '経費が承認された' } }
    expect(problems([apply, approve], [{ name: '督促', from: '経費を申請する', moments: [late] }]))
      .toEqual(['「上長に知らせる」が聴く「経費が承認された」は、それより前の時点の事実ではない'])
    // 分かれ元が本流にない誤りは References が挙げる。それに引きずられた聴く事実の誤りは重ねない
    expect(problems([apply, approve], [{ name: '督促', from: '経費を出す', moments: [late] }])).toEqual([])
  })

  test('事実は、本流と流れのどの軸にあっても、名前で見つかる', () => {
    const retry = moment('申請をやり直す', '申請がやり直された')
    const found = Timeline.located(model({ moments: [apply], flows: [{ name: '差し戻し', from: '経費を申請する', moments: [retry] }] }), '申請がやり直された')
    expect(found).toEqual({ name: '申請がやり直された', attrs: [] })
  })
})
