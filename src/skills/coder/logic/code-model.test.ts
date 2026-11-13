import { describe, expect, test } from 'claude-code/testing'

import type { Model, ModelInput } from '../../../types/fleet'
import { CodeModel } from './code-model'

const order: Model['types'][number] = { id: 'order', name: '注文', world: 'domain', form: 'lifecycle', objects: [{ id: 'draft', name: '下書き', holds: 'unit' }], morphisms: [] }
const base: Model = { ...CodeModel.empty(), name: '注文', types: [order] }
const revised = (current: Model, input: ModelInput) => CodeModel.revise(current, input).either<unknown>(model => model, error => error)

describe('code-model', () => {
  test('渡した集まりはその全体で置き換え、渡さなければ今のまま', () => {
    const logic = [{ id: 'advance', name: '注文を進める', layer: 'domain' as const }]
    expect(revised(base, { logic })).toEqual({ ...base, logic })
    expect(revised({ ...base, logic }, { types: [order] })).toEqual({ ...base, logic })
    expect(revised({ ...base, logic }, { logic: [] })).toEqual(base)
  })

  test('設計図には名前があり、世界は api・domain・db が 1 つずつ', () => {
    expect(revised(CodeModel.empty(), {})).toBe('name がない（この設計図の名前。例: 注文）')
    expect(revised(base, { worlds: [{ id: 'api', name: 'API' }, { id: 'api', name: '境界' }, { id: 'db', name: 'DB' }] })).toBe('worlds は api・domain・db の 3 つを 1 つずつ')
    expect(revised(base, { worlds: [{ id: 'db', name: 'KVS' }, { id: 'domain', name: 'ドメイン' }, { id: 'api', name: 'CLI' }] })).toMatchObject({ worlds: [{ id: 'db', name: 'KVS' }, { id: 'domain', name: 'ドメイン' }, { id: 'api', name: 'CLI' }] })
  })

  test('問題が 1 つでもあれば何も通さず、全部を 1 つの文にする', () => {
    const flows: Model['flows'] = [{ id: 'f', name: '確定する', columns: [{ name: '注文' }], start: {}, steps: [{ logic: 'none', span: [0, 0] }] }]
    expect(revised(base, { maps: [{ from: 'order', to: 'none' }], flows })).toBe('対応 order → none の「none」が型にない / 流れ「確定する」の段の処理「none」が logic にない')
  })
})
