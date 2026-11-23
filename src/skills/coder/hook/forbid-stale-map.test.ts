import { describe, expect, test } from 'claude-code/testing'

import type { DbCall, Engine, Role } from '../../../types/fleet'
import { CodeModel } from '../logic/code-model'
import { forbidStaleMap } from './forbid-stale-map'

const order = { id: 'order', name: '注文', world: 'domain', form: 'value', code: 'src/order.ts#OrderState', objects: [{ id: 'v', name: '注文' }] }
// 設計図（あれば）と、いまのコード（ファイル → 中身）を持つ engine
const engineWith = (role: Role, model: object | undefined, code: Record<string, string>) => ({
  fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role }),
  db: async (_url: string, call: DbCall) => ({ text: model && call.doc_id === 'model' ? `{"id":"model","data":${JSON.stringify(model)},"version":3}` : '' }),
  sources: async (files: string[]) => Object.fromEntries(files.map(file => [file, code[file]])),
}) as unknown as Engine
const model = { ...CodeModel.empty(), name: '注文', types: [order] }
const converged = { status: { state: 'converged' } }

describe('forbid-stale-map', () => {
  test('coder の収束の報告は、地図の code がいまのコードに在れば通す', async () => {
    expect(await forbidStaleMap(engineWith('coder', model, { 'src/order.ts': 'type OrderState = Draft' }), converged)).toBeUndefined()
  })

  test('地図を出した後にコードから消えた名前があれば、収束の報告を拒む', async () => {
    expect(await forbidStaleMap(engineWith('coder', model, { 'src/order.ts': 'type OrderStatus = Draft' }), converged))
      .toBe('地図がいまのコードとずれている。revise_model で直してから報告する: 型「注文」の code の名前「OrderState」が src/order.ts に無い')
  })

  test('収束のほかの報告、coder のほかの ship、設計図がまだ無い coder は止めない', async () => {
    const stale = { 'src/order.ts': '' }
    expect(await forbidStaleMap(engineWith('coder', model, stale), { status: { state: 'working' } })).toBeUndefined()
    expect(await forbidStaleMap(engineWith('qa', model, stale), converged)).toBeUndefined()
    expect(await forbidStaleMap(engineWith('coder', undefined, stale), converged)).toBeUndefined()
  })
})
