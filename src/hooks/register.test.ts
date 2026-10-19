import type { CommandRunInput, On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

const fleet = 'https://claude.ai/artifact/abc'
// plugin の下の世界: 時計・セッションの状態・tool の登録・Skill・ArtifactData をメモリで答える
const world = (on: On) => {
  mock.clock(on, { now: 1000 })
  const state = new Map<string, unknown>()
  const registered: string[] = []
  const writes: Record<string, unknown>[] = []
  on('state.get', async (_$, e) => ({ value: { value: state.get(e.key), version: state.has(e.key) ? 1 : 0 } }))
  on('state.set', async (_$, e) => { state.set(e.key, e.value); return { value: { isSet: true, version: 1 } } })
  on('tool.register', async (_$, e) => { registered.push(e.name); return { value: { tool: `mcp__software-fleet__${e.name}` } } })
  on('tool.call', { tool: 'Skill' }, async () => ({ result: 'skill loaded' }))
  on('tool.call', { tool: 'ArtifactData' }, async (_$, e) => { writes.push(e as Record<string, unknown>); return { result: '' } })
  return { registered, writes, state }
}

describe('register', () => {
  // plugin を丸ごと読み込むので、混んだマシンでは既定の 5 秒を超えることがある
  test('flagship は set_remaining を持ち、それで fleet の DB の残りの塊に書く', { timeoutMs: 15000 }, async ($, on) => {
    const { registered, writes, state } = world(on)
    on('command.run', async () => ({}))
    await $.command.run({ command: 'software-fleet:set-afloat', args: '経費精算' } as CommandRunInput)
    expect(registered).toContain('set_remaining')
    // ダッシュボードの publish で乗ったところから
    state.set('fleet', { url: fleet, role: 'flagship' })
    const chunks = [{ what: '承認経路の実装', blockedBy: ['ask-1'] }]
    expect(await $.tool.call({ tool: 'mcp__software-fleet__set_remaining', chunks })).toEqual({ result: 'RemainingSet' })
    expect(writes.at(-1)).toMatchObject({ url: fleet, action: 'set', collection: 'fleet/flagship/deliverables', doc_id: 'remaining', data: { chunks } })
  })
})
