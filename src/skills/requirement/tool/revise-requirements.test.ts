import { describe, expect, test } from 'claude-code/testing'

import type { DbCall, Engine } from '../../../types/fleet'
import { JsonSchema } from '../../../fleet/schema/json-schema'
import { reviseRequirements } from './revise-requirements'

const to = { kind: '機能', change: '新', who: '経理担当は', can: '予算を承認できる', tests: [{ act: '予算を承認する', evidence: '承認後の一覧に載る' }] }
const shape = (change: unknown) => JsonSchema.check(reviseRequirements.spec.inputSchema, { changes: [change] }).either<unknown>(() => '', e => e)

describe('revise-requirements', () => {
  test('revise_requirements の形: op ごとに要る項目があり、区分と新／改は決まった値', () => {
    expect(shape({ op: 'add', to })).toBe('')
    expect(shape({ op: 'remove', which: { who: '経理担当は', can: '予算を承認できる' } })).toBe('')
    expect(shape({ op: 'replace', to })).toBe('入力.changes[0].which がない')
    expect(shape({ op: 'add', to: { ...to, kind: '使いやすさ' } })).toContain('入力.changes[0].to.kind は 機能 | セキュリティ')
    expect(shape({ op: 'add', to: { ...to, change: '既存' } })).toBe('入力.changes[0].to.change は 新 | 改 のどれか')
  })

  test('今の要求リストに変更を当てて書く。付帯情報は持ち込まない', async () => {
    const calls: DbCall[] = []
    const engine = {
      fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role: 'requirement' }),
      db: async (_url: string, call: DbCall) => { calls.push(call); return { text: '' } },
    } as unknown as Engine
    expect(await reviseRequirements.run(engine, { changes: [{ op: 'add', to: { ...to, extra: 'x' }, note: 'y' }] })).toEqual({ result: 'RequirementsRevised' })
    expect(calls.at(-1)).toEqual({ action: 'set', collection: 'fleet/requirement/deliverables', doc_id: 'requirements', data: { requirements: [to] } })
  })

  test('変更は、計算に使った版に固定して書く（間に別の書き込みがあれば DB が拒む）', async () => {
    const calls: DbCall[] = []
    const stored = `{"id":"requirements","data":{"requirements":[${JSON.stringify(to)}]},"version":4}`
    const engine = {
      fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role: 'requirement' }),
      db: async (_url: string, call: DbCall) => { calls.push(call); return { text: call.action === 'get' ? stored : 'ok' } },
    } as unknown as Engine
    const security = { ...to, kind: 'セキュリティ', who: '他部署の人は', can: '予算を見られない' }
    expect(await reviseRequirements.run(engine, { changes: [{ op: 'add', to: security }] })).toEqual({ result: 'RequirementsRevised' })
    expect(calls.map(call => call.action)).toEqual(['get', 'set'])
    expect(calls.at(-1)).toEqual({ action: 'set', collection: 'fleet/requirement/deliverables', doc_id: 'requirements', data: { requirements: [to, security] }, if_version: 4 })
  })
})
