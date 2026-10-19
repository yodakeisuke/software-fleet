import { describe, expect, test } from 'claude-code/testing'

import type { DbCall, Engine } from '../../../types/fleet'
import { JsonSchema } from '../../../fleet/json-schema'
import { reviseGuide } from './revise-guide'

const decision = { issue: '取り込める件数', decision: '1 回 1 万行まで', why: '依頼に上限がなく、簡単な側に倒した' }
const shape = (input: unknown) => JsonSchema.check(reviseGuide.spec.inputSchema, input).either<unknown>(() => '', e => e)
// ファイルを files の中身で読み、DB への呼び出しを calls に残す
const engineWith = (files: Record<string, string>, calls: DbCall[], reads: string[] = []) => ({
  fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role: 'cs' }),
  db: async (_url: string, call: DbCall) => { calls.push(call); return { text: '' } },
  read: async (path: string) => { reads.push(path); if (path in files) return files[path]; throw new Error(`ENOENT: ${path}`) },
}) as unknown as Engine

describe('revise-guide', () => {
  test('revise_guide の形: ファイルと決定ログが要り、決定ログは論点・決めたこと・理由の組', () => {
    expect(shape({ file: '/tmp/import.html', decisions: [] })).toBe('')
    expect(shape({ decisions: [] })).toBe('入力.file がない')
    expect(shape({ file: '/tmp/import.html', decisions: [{ issue: '件数', decision: '1 万行' }] })).toBe('入力.decisions[0].why がない')
  })

  test('ファイルの中身と決定ログで、前のガイドを置き換える。付帯情報は持ち込まない', async () => {
    const calls: DbCall[] = []
    const engine = engineWith({ '/tmp/import.html': '<h1>実績データのインポート</h1>' }, calls)
    expect(await reviseGuide.run(engine, { file: '/tmp/import.html', decisions: [{ ...decision, extra: 'x' }] })).toEqual({ result: 'GuideRevised' })
    expect(calls.at(-1)).toEqual({ action: 'set', collection: 'fleet/cs/deliverables', doc_id: 'guide', data: { html: '<h1>実績データのインポート</h1>', decisions: [decision] } })
  })

  test('HTML でないファイルは読まない（Read の権限を通らない読み込みで、ほかのファイルを持ち出さない）', async () => {
    const calls: DbCall[] = [], reads: string[] = []
    const engine = engineWith({ '.env': 'SECRET=1' }, calls, reads)
    expect(await reviseGuide.run(engine, { file: '.env', decisions: [] })).toEqual({ deny: 'ガイドは .html のファイルで渡す: .env' })
    expect([reads, calls]).toEqual([[], []])
  })

  test('ファイルを読めなければ、何も書かずに理由を返す', async () => {
    const calls: DbCall[] = []
    const reply = await reviseGuide.run(engineWith({}, calls), { file: '/tmp/none.html', decisions: [] })
    expect(reply).toEqual({ deny: 'ガイドのファイルを読めない（/tmp/none.html）: ENOENT: /tmp/none.html' })
    expect(calls).toEqual([])
  })
})
