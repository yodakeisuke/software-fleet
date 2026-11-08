import { describe, expect, test } from 'claude-code/testing'

import type { ModelFlow, Model } from '../../../types/fleet'
import { CodeModel } from './code-model'
import { Flows } from './flows'

const confirm: ModelFlow = {
  id: 'confirm', name: '確定する', columns: [{ name: '依頼者', kind: 'api' }, { name: '注文' }, { name: '保存データ', kind: 'stored' }], start: { 0: '確定の依頼', 2: '保存データ' },
  steps: [{ logic: 'read', span: [0, 2], out: { 1: { name: '注文〈下書き〉', kind: 'stored' } } }, { logic: 'write', span: [0, 2], out: { 0: { name: '確定した', kind: 'api' } }, drop: [1] }],
}
const model = (flows: ModelFlow[]): Model => ({ ...CodeModel.empty(), name: '注文', logic: [{ id: 'read', name: '注文を読む', layer: 'persistence' }, { id: 'write', name: '注文を書く', layer: 'persistence' }], flows })

describe('flows', () => {
  test('段の処理は logic にある', () => {
    expect(Flows.problems(model([confirm]))).toEqual([])
    expect(Flows.problems(model([{ ...confirm, steps: [{ logic: 'auth', span: [0, 1] }] }]))).toEqual(['流れ「確定する」の段の処理「auth」が logic にない'])
  })

  test('start・span・out・drop の列は流れの列の範囲で、span は [左, 右]', () => {
    expect(Flows.problems(model([{ ...confirm, start: { 3: 'x' } }]))).toEqual(['流れ「確定する」の start の列 3 がない（列は 0〜2）'])
    expect(Flows.problems(model([{ ...confirm, steps: [{ logic: 'read', span: [2, 0] }] }]))).toEqual(['流れ「確定する」の段「read」の span は [左, 右] の列（列は 0〜2）'])
    expect(Flows.problems(model([{ ...confirm, steps: [{ logic: 'read', span: [0] }] }]))).toEqual(['流れ「確定する」の段「read」の span は [左, 右] の列（列は 0〜2）'])
    expect(Flows.problems(model([{ ...confirm, steps: [{ logic: 'read', span: [0, 1], out: { 5: { name: 'x' } }, drop: [1.5] }] }])))
      .toEqual(['流れ「確定する」の段「read」の列 5 がない（列は 0〜2）', '流れ「確定する」の段「read」の列 1.5 がない（列は 0〜2）'])
  })
})
