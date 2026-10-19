import { describe, expect, test } from 'claude-code/testing'

import type { Behavior, Moment, ReadModel, View } from '../../../types/fleet'
import { References } from './references'

const moment = (command: string, event: string, reads: string[] = []): Moment => ({
  change: '既', by: { kind: 'screen', actor: '申請者', screen: '申請フォーム', sketch: '[申請する]' }, reads,
  command: { name: command, params: [] }, aggregate: '経費', events: [{ name: event, attrs: [] }], otherwise: [], tests: [],
})
const readModel = (name: string, sources: string[]): ReadModel => ({ change: '既', name, fields: ['金額'], sources, tests: [] })
const view = (screen: string, at: string, reads: string[] = []): View => ({ change: '既', actor: '経理担当', screen, sketch: '一覧', reads, at })
const apply = moment('経費を申請する', '経費が申請された')
const model = (parts: Partial<Behavior>): Behavior => ({ moments: [apply], views: [], readModels: [], flows: [], hotspots: [], ...parts })
const problems = (parts: Partial<Behavior>) => References.problems(model(parts))

describe('references', () => {
  test('リードモデル・画面・流れ・問いは名前で指すので、同じ名前はそれぞれ 1 つだけ', () => {
    expect(problems({
      readModels: [readModel('申請一覧', []), readModel('申請一覧', [])], views: [view('一覧', '経費を申請する'), view('一覧', '経費を申請する')],
      flows: [{ name: '差し戻し', from: '経費を申請する', moments: [] }, { name: '差し戻し', from: '経費を申請する', moments: [] }],
      hotspots: [{ question: '上限は？', assumption: '10万円' }, { question: '上限は？', assumption: '5万円' }],
    })).toEqual(['リードモデル「申請一覧」が重なっている', '画面「一覧」が重なっている', '流れ「差し戻し」が重なっている', '問い「上限は？」が重なっている'])
  })

  test('時点と画面が読むリードモデルは盤面にあり、その出どころは軸の事実（読む時点より後の事実でもよい）', () => {
    expect(problems({ moments: [moment('経費を申請する', '経費が申請された', ['申請一覧'])], readModels: [readModel('申請一覧', ['経費が申請された'])] })).toEqual([])
    expect(problems({ moments: [moment('経費を申請する', '経費が申請された', ['申請一覧'])] })).toEqual(['「経費を申請する」が読む「申請一覧」がリードモデルにない'])
    expect(problems({ views: [view('一覧', '経費を申請する', ['承認待ち'])], readModels: [readModel('申請一覧', ['経費が送られた'])] }))
      .toEqual(['画面「一覧」が読む「承認待ち」がリードモデルにない', '「申請一覧」の出どころ「経費が送られた」が軸の事実にない'])
  })

  test('読むだけの画面はどこかの軸の時点で見る。流れは本流のコマンドから分かれる。問いが関わる事実は軸の事実', () => {
    expect(problems({ views: [view('一覧', '経費を返す')], flows: [{ name: '差し戻し', from: '経費を返す', moments: [] }], hotspots: [{ question: '上限は？', assumption: '10万円', at: '経費が返された' }] }))
      .toEqual(['画面「一覧」を見る時点「経費を返す」がない', '流れ「差し戻し」の分かれ元「経費を返す」が本流のコマンドにない', '問い「上限は？」が関わる「経費が返された」が軸の事実にない'])
    expect(problems({ hotspots: [{ question: '上限は？', assumption: '10万円' }, { question: '締めは？', assumption: '月末', at: '経費が申請された' }] })).toEqual([])
  })
})
