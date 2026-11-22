import { describe, expect, test } from 'claude-code/testing'

import type { Model, ModelType } from '../../../types/fleet'
import { CodeModel } from './code-model'
import { References } from './references'

const line: ModelType = { id: 'line', name: '明細', world: 'domain', form: 'lifecycle', many: '行', objects: [{ id: 'open', name: '未引当', holds: 'unit' }, { id: 'shipped', name: '出荷済', holds: 'unit' }], morphisms: [{ from: 'open', to: 'shipped', by: '出荷する' }] }
const order: ModelType = {
  id: 'order', name: '注文', world: 'domain', form: 'lifecycle',
  objects: [{ id: 'draft', name: '下書き', holds: { parts: [{ type: 'line' }] } }, { id: 'done', name: '完了', holds: { parts: [{ type: 'line' }], invariant: '全明細が出荷済' } }],
  morphisms: [{ from: 'draft', to: 'done', by: '全明細が出荷済', auto: true }],
}
const orders: ModelType = { id: 't_orders', name: 'orders', world: 'db', form: 'table', columns: [{ name: 'id', type: 'uuid', pk: true }, { name: 'customer_id', type: 'uuid', fk: 't_customers' }] }
const customers: ModelType = { id: 't_customers', name: 'customers', world: 'db', form: 'table', columns: [{ name: 'id', type: 'uuid', pk: true }] }
const model = (types: ModelType[], maps: Model['maps'] = []): Model => ({ ...CodeModel.empty(), name: '注文', types, maps })

describe('references', () => {
  test('型・処理・流れの id、型の名前、型の中の箱の id、表の列の名前は 1 つだけ', () => {
    expect(References.problems(model([order, line, { ...line, id: 'order', name: '別の明細' }]))).toEqual(['型の id「order」が重なっている'])
    // 流れの線は型の名前で結ばれるので、API の注文とドメインの注文を同じ名前にしない
    expect(References.problems(model([order, line, { ...order, id: 'api_order', world: 'api' }]))).toEqual(['型の名前「注文」が重なっている'])
    expect(References.problems(model([{ ...line, objects: [...line.objects!, { id: 'open', name: '開', holds: 'unit' }] }]))).toEqual(['型「明細」の箱の id「open」が重なっている'])
    expect(References.problems(model([{ ...customers, columns: [...customers.columns!, { name: 'id', type: 'text' }] }]))).toEqual(['表「customers」の列「id」が重なっている'])
    expect(References.duplicated(['a', 'b', 'a'], '処理の id')).toEqual(['処理の id「a」が重なっている'])
  })

  test('表は列を持ち fk の先は表、表以外は箱を持つ', () => {
    expect(References.problems(model([orders, customers, order, line]))).toEqual([])
    expect(References.problems(model([{ ...orders, columns: [] }]))).toEqual(['表「orders」に columns がない'])
    expect(References.problems(model([orders, order, line]))).toEqual(['表「orders」の列 customer_id の fk「t_customers」が表にない'])
    expect(References.problems(model([orders, { ...customers, id: 't_customers', form: 'value', objects: [{ id: 'v', name: 'x', holds: 'unit' }] }]))).toEqual(['表「orders」の列 customer_id の fk「t_customers」が表にない'])
    expect(References.problems(model([{ ...line, objects: [] }]))).toEqual(['型「明細」に objects がない', '型「明細」の遷移「出荷する」の端「open」が箱にない', '型「明細」の遷移「出荷する」の端「shipped」が箱にない'])
  })

  test('部品の型、遷移の両端、対応の両端がある', () => {
    expect(References.problems(model([order]))).toEqual([
      '型「注文」の「下書き」の部品が指す型「line」がない', '型「注文」の「完了」の部品が指す型「line」がない',
    ])
    expect(References.problems(model([{ ...order, morphisms: [{ from: 'draft', to: 'gone', by: '消す' }] }, line]))).toEqual(['型「注文」の遷移「消す」の端「gone」が箱にない'])
    expect(References.problems(model([order, line], [{ from: 'order', to: 't_orders' }]))).toEqual(['対応 order → t_orders の「t_orders」が型にない'])
  })

  test('並んだ箱は「どれか 1 つ」。全部そろう value と record の箱は 1 つ', () => {
    const request: ModelType = { id: 'req', name: '確定の依頼', world: 'api', form: 'record', objects: [{ id: 'v', name: '確定の依頼', holds: { parts: [{ type: 'line', as: '明細' }] } }] }
    expect(References.problems(model([request, line]))).toEqual([])
    // 項目を箱として並べると、地図は「番号か操作者のどちらか」と描く
    const fields = [{ id: 'id', name: '番号', holds: { prim: 'UUID' } }, { id: 'actor', name: '操作者', holds: { prim: 'ID' } }]
    expect(References.problems(model([{ ...request, objects: fields }]))).toEqual(['型「確定の依頼」は record なので箱は 1 つ（項目は holds.parts に並べる。箱を並べると「どれか 1 つ」になる）'])
    expect(References.problems(model([{ ...request, form: 'value', objects: fields }]))).toEqual(['型「確定の依頼」は value なので箱は 1 つ（項目は holds.parts に並べる。箱を並べると「どれか 1 つ」になる）'])
    expect(References.problems(model([{ ...request, form: 'kind', objects: fields }]))).toEqual([])
  })

  test('holds を省いた箱は unit（問題にしない）', () => {
    const kind: ModelType = { id: 'reason', name: '取消理由', world: 'domain', form: 'kind', objects: [{ id: 'mind', name: '気が変わった' }, { id: 'late', name: '届かない' }] }
    expect(References.problems(model([kind, order, line]))).toEqual([])
  })
})
