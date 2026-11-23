import { describe, expect, test } from 'claude-code/testing'

import type { DbCall, Engine } from '../../../types/fleet'
import { JsonSchema } from '../../../fleet/schema/json-schema'
import { CodeModel } from '../logic/code-model'
import { reviseModel } from './revise-model'

const order = { id: 'order', name: '注文', world: 'domain', form: 'lifecycle', objects: [{ id: 'draft', name: '下書き', at: [0, 0], holds: { parts: [{ type: 'money', as: '合計' }] } }], morphisms: [] }
const money = { id: 'money', name: '金額', world: 'domain', form: 'value', objects: [{ id: 'v', name: '金額', holds: { prim: '整数', invariant: '0 以上' } }] }
const shape = (input: unknown) => JsonSchema.check(reviseModel.spec.inputSchema, input).either<unknown>(() => '', e => e)
// DB の中身（"collection/id" ごと）を持つ engine。呼び出しを calls に残す
// code は、いまのコード（ファイル → 中身）を持つ engine に照合される
const engineWith = (stored: Record<string, object>, calls: DbCall[], code: Record<string, string> = {}) => ({
  fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role: 'coder' }),
  now: async () => 1000,
  sources: async (files: string[]) => Object.fromEntries(files.map(file => [file, code[file]])),
  db: async (_url: string, call: DbCall) => {
    calls.push(call)
    const doc = stored[`${call.collection}/${call.doc_id}`]
    return { text: call.action === 'get' && doc ? `{"id":"${call.doc_id}","data":${JSON.stringify(doc)},"version":3}` : 'ok' }
  },
}) as unknown as Engine

describe('revise-model', () => {
  test('revise_model の形: 箱の中身は unit か prim か parts、位置と span は数、change は 新・改・削', () => {
    expect(shape({ name: '注文', types: [order, money] })).toBe('')
    expect(shape({ types: [{ ...order, objects: [{ id: 'draft', name: '下書き', holds: 'none' }] }] })).toBe('入力.types[0].objects[0].holds は unit のどれか')
    expect(shape({ types: [{ ...order, objects: [{ id: 'draft', name: '下書き', at: ['0', '0'], holds: 'unit' }] }] })).toBe('入力.types[0].objects[0].at[0] は number でなければならない / 入力.types[0].objects[0].at[1] は number でなければならない')
    expect(shape({ types: [{ ...order, change: '既' }] })).toBe('入力.types[0].change は 新 | 改 | 削 のどれか')
    expect(shape({ flows: [{ id: 'f', name: '確定する', columns: [{ name: '注文' }], start: { 0: '依頼' }, steps: [{ logic: 'x', span: [0, 0], out: { 0: { kind: 'api' } } }] }] })).toBe('入力.flows[0].steps[0].out.0.name がない')
  })

  test('渡した集まりを今の設計図に当てて、その文書に書く。付帯情報は持ち込まない', async () => {
    const calls: DbCall[] = []
    const stored = { 'fleet/coder/deliverables/model': { ...CodeModel.empty(), name: '注文', types: [money] } }
    expect(await reviseModel.run(engineWith(stored, calls), { types: [order, money], tool: 'mcp__software-fleet__revise_model' })).toEqual({ result: 'ModelRevised' })
    expect(calls.filter(call => call.action === 'set')).toEqual([{ action: 'set', collection: 'fleet/coder/deliverables', doc_id: 'model', if_version: 3, data: { ...CodeModel.empty(), name: '注文', types: [order, money], at: '1970-01-01T00:00:01.000Z' } }])
  })

  test('直すたびに、直した時刻を今にする（QA の判定がどのコードに対するものかをページが見る）', async () => {
    const calls: DbCall[] = []
    const stored = { 'fleet/coder/deliverables/model': { ...CodeModel.empty(), name: '注文', types: [money], at: '1969-12-31T00:00:00.000Z' } }
    expect(await reviseModel.run(engineWith(stored, calls), { name: '注文' })).toEqual({ result: 'ModelRevised' })
    expect(calls.find(call => call.action === 'set')?.data).toEqual({ ...CodeModel.empty(), name: '注文', types: [money], at: '1970-01-01T00:00:01.000Z' })
  })

  test('型の code を、いまのコードと照合してから書く。渡していない型の code も、呼ぶたびに照合し直す', async () => {
    const calls: DbCall[] = []
    const typed = { ...order, code: 'src/order.ts#OrderState' }
    const code = { 'src/order.ts': 'export type OrderState = Draft' }
    expect(await reviseModel.run(engineWith({}, calls, code), { name: '注文', types: [typed, money] })).toEqual({ result: 'ModelRevised' })
    expect(calls.find(call => call.action === 'set')?.data).toMatchObject({ types: [typed, money] })
    const stored = { 'fleet/coder/deliverables/model': { ...CodeModel.empty(), name: '注文', types: [typed, money] } }
    const renamed: DbCall[] = []
    expect(await reviseModel.run(engineWith(stored, renamed, { 'src/order.ts': 'export type OrderStatus = Draft' }), { logic: [] })).toEqual({ deny: '型「注文」の code の名前「OrderState」が src/order.ts に無い' })
    expect(await reviseModel.run(engineWith(stored, renamed), { logic: [] })).toEqual({ deny: '型「注文」の code のファイル「src/order.ts」が読めない（プロジェクトのルートからのパス）' })
    expect(renamed.map(call => call.action)).toEqual(['get', 'get'])
  })

  test('問題があれば何も書かず、全部を返す', async () => {
    const calls: DbCall[] = []
    expect(await reviseModel.run(engineWith({}, calls), { types: [order] })).toEqual({ deny: 'name がない（この設計図の名前。例: 注文） / 型「注文」の「下書き」の部品が指す型「money」がない' })
    expect(calls.map(call => call.action)).toEqual(['get'])
  })
})
