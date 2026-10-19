import { describe, expect, test } from 'claude-code/testing'

import type { DbCall, Engine } from '../../../types/fleet'
import { reviseGuide } from './revise-guide'

const decision = { issue: '取り込める件数', decision: '1 回 1 万行まで', why: '依頼に上限がなく、簡単な側に倒した' }
// links はリンクとその先。files にあるファイルだけを許可なしに読め、DB への呼び出しを calls に残す
const engineWith = (files: Record<string, string>, calls: DbCall[], reads: string[] = [], links: Record<string, string> = {}) => ({
  fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role: 'cs' }),
  db: async (_url: string, call: DbCall) => { calls.push(call); return { text: '' } },
  read: async (path: string) => { reads.push(path); return files[path] },
  realPath: async (path: string) => links[path] ?? path,
  readable: async (path: string) => path in files,
}) as unknown as Engine

describe('revise-guide', () => {
  test('リンクをたどった先のファイルの中身と決定ログで、前のガイドを置き換える。付帯情報は持ち込まない', async () => {
    const calls: DbCall[] = []
    const engine = engineWith({ '/tmp/import.html': '<h1>実績データのインポート</h1>' }, calls, [], { '/tmp/guide.html': '/tmp/import.html' })
    expect(await reviseGuide.run(engine, { file: '/tmp/guide.html', decisions: [{ ...decision, extra: 'x' }] })).toEqual({ result: 'GuideRevised' })
    expect(calls.at(-1)).toEqual({ action: 'set', collection: 'fleet/cs/deliverables', doc_id: 'guide', data: { html: '<h1>実績データのインポート</h1>', decisions: [decision] } })
  })

  test('モデル自身が許可なしに Read できるファイルだけを、リンクをたどった先で判定して読む（それ以上のものを持ち出さない）', async () => {
    const calls: DbCall[] = [], reads: string[] = []
    const engine = engineWith({ '/tmp/guide.html': '<h1>x</h1>' }, calls, reads, { '/tmp/guide.html': '/Users/me/.ssh/id_rsa' })
    expect(await reviseGuide.run(engine, { file: '/tmp/guide.html', decisions: [] })).toEqual({ deny: '/tmp/guide.html は許可なしには Read できない。許可なしに読める場所に置き直す' })
    expect([reads, calls]).toEqual([[], []])
  })
})
