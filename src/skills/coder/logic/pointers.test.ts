import { describe, expect, test } from 'claude-code/testing'

import type { Model } from '../../../types/fleet'
import { CodeModel } from './code-model'
import { Pointers } from './pointers'

const type = (name: string, more: Partial<Model['types'][number]>): Model['types'][number] => ({ id: name, name, world: 'domain', form: 'value', objects: [{ id: 'v', name }], ...more })
const model = (...types: Model['types']): Model => ({ ...CodeModel.empty(), name: '注文', types })
const state = 'export type OrderState = Draft | Placed\nconst orderStateOf = (row: Row): OrderState => row.state\n'

describe('pointers', () => {
  test('読むファイルは、code を言った型のファイルを 1 度ずつ。code の無い型と 削 の型は数えない', () => {
    expect(Pointers.files(model(type('注文', { code: 'src/order.ts#OrderState' }), type('明細', { code: 'src/order.ts#Line' }), type('金額', { code: 'src/money.ts#Money' }), type('素の値', {}), type('旧注文', { code: 'src/old.ts#Old', change: '削' }))))
      .toEqual(['src/order.ts', 'src/money.ts'])
  })

  test('code の名前が、指したファイルに 1 語として在れば通す', () => {
    const sources = { 'src/order.ts': state }
    expect(Pointers.problems(model(type('注文', { code: 'src/order.ts#OrderState' }), type('素の値', {})), sources)).toEqual([])
    expect(Pointers.problems(model(type('注文', { code: 'src/order.ts#Order' })), sources)).toEqual(['型「注文」の code の名前「Order」が src/order.ts に無い'])
    expect(Pointers.problems(model(type('注文', { code: 'src/order.ts#State' })), sources)).toEqual(['型「注文」の code の名前「State」が src/order.ts に無い'])
    expect(Pointers.problems(model(type('注文', { code: 'src/order.ts#orderStateOf' })), sources)).toEqual([])
  })

  test('名前は字のまま探す（記号を含む名前も、日本語の識別子も）', () => {
    const sources = { 'a.ts': "type 削除の仕方 = CommentDeleted['outcome']\nconst 注文状態 = 1\n" }
    expect(Pointers.problems(model(type('削除の仕方', { code: "a.ts#CommentDeleted['outcome']" }), type('状態', { code: 'a.ts#注文状態' })), sources)).toEqual([])
    expect(Pointers.problems(model(type('状態', { code: 'a.ts#注文' }), type('何でも', { code: 'a.ts#.*' })), sources)).toEqual(['型「状態」の code の名前「注文」が a.ts に無い', '型「何でも」の code の名前「.*」が a.ts に無い'])
  })

  test('ファイルが読めなければ拒む', () => {
    expect(Pointers.problems(model(type('注文', { code: 'src/gone.ts#OrderState' })), { 'src/gone.ts': undefined })).toEqual(['型「注文」の code のファイル「src/gone.ts」が読めない（プロジェクトのルートからのパス）'])
  })

  test('code は「ファイル#名前」の形。名前だけ・ファイルだけは拒む', () => {
    const shaped = (code: string) => Pointers.problems(model(type('注文', { code })), {})
    expect(shaped('OrderState')).toEqual(['型「注文」の code「OrderState」は「ファイル#名前」の形（例: src/order/state.ts#OrderState）'])
    expect(shaped('src/order.ts#')).toEqual(['型「注文」の code「src/order.ts#」は「ファイル#名前」の形（例: src/order/state.ts#OrderState）'])
    expect(shaped('#OrderState')).toEqual(['型「注文」の code「#OrderState」は「ファイル#名前」の形（例: src/order/state.ts#OrderState）'])
  })

  test('削 の型は消した物なので、コードに無くてよい', () => {
    expect(Pointers.problems(model(type('旧注文', { code: 'src/old.ts#Old', change: '削' })), {})).toEqual([])
  })
})
