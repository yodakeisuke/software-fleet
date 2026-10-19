import { describe, expect, test } from 'claude-code/testing'

import type { Behavior, CommandTest, Moment, ReadModel, ReadTest } from '../../../types/fleet'
import { Gwt } from './gwt'

const secure: Moment = {
  change: '新', by: { kind: 'screen', actor: '経理担当', screen: '予算の登録', sketch: '[確保する]' }, reads: [],
  command: { name: '予算を確保する', params: ['部署', '金額'] }, aggregate: '予算', events: [{ name: '予算が確保された', attrs: ['部署', '残額'] }], otherwise: [],
  tests: [{ name: '部署に予算を確保する', given: [], when: { 部署: '営業', 金額: '10万円' }, expect: [{ event: '予算が確保された', values: { 部署: '営業', 残額: '10万円' } }] }],
}
const within: CommandTest = {
  name: '予算内なら申請される',
  given: [{ event: '予算が確保された', values: { 部署: '営業', 残額: '10万円' } }],
  when: { 金額: '3万円', 用途: '交通費' },
  expect: [{ event: '経費が申請された', values: { 金額: '3万円' } }],
}
const over: CommandTest = { ...within, name: '予算を超えると差し戻される', when: { 金額: '12万円' }, expect: [{ event: '予算超過で差し戻された', values: { 金額: '12万円' } }] }
const apply = (tests: CommandTest[], change: Moment['change'] = '新'): Moment => ({
  change, by: { kind: 'screen', actor: '申請者', screen: '申請フォーム', sketch: '[申請する]' }, reads: [],
  command: { name: '経費を申請する', params: ['金額', '用途'] }, aggregate: '経費',
  events: [{ name: '経費が申請された', attrs: ['金額', '用途'] }], otherwise: [{ name: '予算超過で差し戻された', attrs: ['金額'] }], tests,
})
const balance = (tests: ReadModel['tests'], change: ReadModel['change'] = '新'): ReadModel =>
  ({ change, name: '予算残高', fields: ['部署', '残額'], sources: ['予算が確保された', '経費が申請された'], tests })
const problems = (moments: Moment[], readModels: ReadModel[] = [], flows: Behavior['flows'] = []) => Gwt.problems({ moments, readModels, flows, views: [], hotspots: [] })

describe('gwt', () => {
  test('新・改の時点は、起きる事実と別の結果のどれにも、それを起こす例が要る。拒否の例は数えない。既存（既）は要らない', () => {
    expect(problems([secure, apply([within, over])])).toEqual([])
    expect(problems([secure, apply([within, { ...over, expect: 'error' }])])).toEqual(['「経費を申請する」に「予算超過で差し戻された」を起こす例がない'])
    expect(problems([secure, apply([], '既')])).toEqual([])
  })

  test('流れの中の新・改の時点にも、同じく例が要る', () => {
    const retry = { ...apply([], '新'), command: { name: '申請をやり直す', params: [] }, events: [{ name: '申請がやり直された', attrs: [] }], otherwise: [] }
    expect(problems([secure, apply([within, over])], [], [{ name: '差し戻し', from: '経費を申請する', moments: [retry] }])).toEqual(['「申請をやり直す」に「申請がやり直された」を起こす例がない'])
  })

  test('新・改のリードモデルには例が要る。既存（既）は要らない', () => {
    expect(problems([secure], [balance([])])).toEqual(['「予算残高」に例がない'])
    expect(problems([secure], [balance([], '既')])).toEqual([])
  })

  test('前提は軸の事実で、値の鍵はその事実の属性。軸のどこで起きる事実でも前提にできる（ほかの回の履歴）', () => {
    const later = { ...secure, tests: [{ ...secure.tests[0] as CommandTest, given: [{ event: '経費が申請された', values: { 金額: '1円' } }] }] }
    const unknown = { ...within, name: '承認の後に申請する', given: [{ event: '経費が承認された', values: {} }] }
    const wrongKey = { ...within, name: '属性の名前を間違える', given: [{ event: '予算が確保された', values: { 予算: '10万円' } }] }
    expect(problems([later, apply([unknown, over, wrongKey])])).toEqual([
      '「経費を申請する」の例「承認の後に申請する」: 前提の「経費が承認された」は軸の事実にない',
      '「経費を申請する」の例「属性の名前を間違える」: 前提の「予算が確保された」の「予算」は属性にない（属性: 部署・残額）',
    ])
  })

  test('コマンドの例の名前は他の例と違う点なので、同じコマンドの中で重ならない', () => {
    expect(problems([secure, apply([within, within, over])])).toEqual(['「経費を申請する」の例「予算内なら申請される」が重なっている'])
  })

  test('名乗りの鍵は軸のどの事実も束ねるので、前提と結果の値に書ける', () => {
    const several = { ...within, given: [{ event: '予算が確保された', values: { 申請ID: 'A-1', 部署: '営業', 残額: '10万円' } }], expect: [{ event: '経費が申請された', values: { 申請ID: 'A-2', 金額: '3万円' } }] }
    const named = (identity?: Behavior['identity']) => Gwt.problems({ identity, moments: [secure, apply([several, over])], readModels: [], flows: [], views: [], hotspots: [] })
    expect(named({ unit: '1 回の申請', key: '申請ID' })).toEqual([])
    expect(named()).toEqual([
      '「経費を申請する」の例「予算内なら申請される」: 前提の「予算が確保された」の「申請ID」は属性にない（属性: 部署・残額）',
      '「経費を申請する」の例「予算内なら申請される」: 結果の「経費が申請された」の「申請ID」は属性にない（属性: 金額・用途）',
    ])
  })

  test('操作の鍵はコマンドの入力か「時刻」で、結果はその時点で起きうる事実（値の鍵はその属性）', () => {
    const late = { ...over, name: '締切の後は拒否される', when: { 金額: '1万円', 時刻: '2026-10-01 09:00' }, expect: 'error' as const }
    expect(problems([secure, apply([within, over, late])])).toEqual([])
    const odd: CommandTest = { ...within, when: { 金額: '3万円', 申請者: '佐藤' }, expect: [{ event: '予算が確保された', values: {} }, { event: '経費が申請された', values: { 用途: '交通費', 日付: '10/1' } }] }
    expect(problems([secure, apply([odd, over])])).toEqual([
      '「経費を申請する」の例「予算内なら申請される」: 操作の「申請者」はコマンドの入力にない（入力: 金額・用途）',
      '「経費を申請する」の例「予算内なら申請される」: 結果の「予算が確保された」はこの時点で起きうる事実にない',
      '「経費を申請する」の例「予算内なら申請される」: 結果の「経費が申請された」の「日付」は属性にない（属性: 金額・用途）',
    ])
  })

  test('見える行の鍵はリードモデルの項目で、前提は軸の事実。同じリードモデルの例の名前は重ならない', () => {
    const decreased: ReadTest = { name: '申請の分だけ残額が減る', given: [{ event: '予算が確保された', values: { 部署: '営業', 残額: '10万円' } }, { event: '経費が申請された', values: { 金額: '3万円' } }], rows: [{ 部署: '営業', 残額: '7万円' }] }
    expect(problems([secure, apply([within, over])], [balance([decreased])])).toEqual([])
    const ghost: ReadTest = { ...decreased, name: '無い事実を前提にする', given: [{ event: '予算が凍結された', values: {} }] }
    expect(problems([secure, apply([within, over])], [balance([ghost])])).toEqual(['「予算残高」の例「無い事実を前提にする」: 前提の「予算が凍結された」は軸の事実にない'])
    const wrong: ReadTest = { ...decreased, rows: [{ 部署: '営業', 残り: '7万円' }, { 部署: '総務', 残り: '0円' }] }
    expect(problems([secure, apply([within, over])], [balance([wrong, wrong])])).toEqual([
      '「予算残高」の例「申請の分だけ残額が減る」が重なっている',
      '「予算残高」の例「申請の分だけ残額が減る」: 見える行の「残り」は項目にない（項目: 部署・残額）',
      '「予算残高」の例「申請の分だけ残額が減る」: 見える行の「残り」は項目にない（項目: 部署・残額）',
    ])
  })
})
