import type { CommandRunInput, On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

const fleet = 'https://claude.ai/artifact/abc'
const moment = {
  change: '新', by: { kind: 'screen', actor: '申請者', screen: '申請フォーム', sketch: '金額 [____]\n[申請する]' }, reads: [],
  command: { name: '経費を申請する', params: ['金額'] }, aggregate: '経費', events: [{ name: '経費が申請された', attrs: ['金額'] }], otherwise: [],
  tests: [{ name: '申請される', given: [], when: { 金額: '3万円' }, expect: [{ event: '経費が申請された', values: { 金額: '3万円' } }] }],
}
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
  test('fleet に乗ったセッションが preview_start で dev server を起こすのは拒み、url で開くだけなら通す', { timeoutMs: 15000 }, async ($, on) => {
    const { state } = world(on)
    on('tool.call', { tool: 'mcp__Claude_Browser__preview_start' }, async () => ({ result: 'started' }))
    expect(await $.tool.call({ tool: 'mcp__Claude_Browser__preview_start', name: 'dash' })).toEqual({ result: 'started' })
    state.set('fleet', { url: fleet, role: 'qa' })
    expect(await $.tool.call({ tool: 'mcp__Claude_Browser__preview_start', name: 'dash' })).toMatchObject({ deny: expect.stringContaining('preview_start') })
    expect(await $.tool.call({ tool: 'mcp__Claude_Browser__preview_start', url: 'http://localhost:3000' })).toEqual({ result: 'started' })
  })

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

  test('behavior の ship になったセッションは revise_behavior を持ち、それで fleet の DB の event model に書く', { timeoutMs: 15000 }, async ($, on) => {
    const { registered, writes } = world(on)
    await $.tool.call({ tool: 'Skill', skill: 'software-fleet:behavior', args: fleet })
    expect(registered).toEqual(['report_status', 'revise_behavior'])
    expect(await $.tool.call({ tool: 'mcp__software-fleet__revise_behavior', note: '申請を足す', moments: [{ op: 'add', to: moment }] })).toEqual({ result: 'BehaviorRevised' })
    expect(writes.find(call => call.doc_id === 'event-model' && call.action === 'set')).toMatchObject({ url: fleet, action: 'set', collection: 'fleet/behavior/deliverables', data: { moments: [moment], views: [], readModels: [], flows: [], hotspots: [] } })
    expect(writes.at(-1)).toMatchObject({ url: fleet, action: 'set', collection: 'fleet/behavior/journal', data: { note: '申請を足す', changed: '時点 +1 ~0 -0' } })
  })

  test('implementation の ship になったセッションは set_pull_request を持ち、それで fleet の DB に PR の URL を書く', { timeoutMs: 15000 }, async ($, on) => {
    const { registered, writes } = world(on)
    await $.tool.call({ tool: 'Skill', skill: 'software-fleet:implementation', args: fleet })
    expect(registered).toEqual(['report_status', 'set_pull_request'])
    const url = 'https://github.com/owner/repo/pull/12'
    expect(await $.tool.call({ tool: 'mcp__software-fleet__set_pull_request', url })).toEqual({ result: 'PullRequestSet' })
    expect(writes.at(-1)).toMatchObject({ url: fleet, action: 'set', collection: 'fleet/implementation/deliverables', doc_id: 'pull-request', data: { url } })
  })

  for (const [ship, document, doc_id] of [['cs', 'guide', 'guide'], ['ops', 'operationsDesign', 'operations-design']] as const) {
    test(`${ship} の ship になったセッションは revise_document を持ち、それで fleet の DB に文書を書く`, { timeoutMs: 15000 }, async ($, on) => {
      const { registered, writes } = world(on)
      await $.tool.call({ tool: 'Skill', skill: `software-fleet:${ship}`, args: fleet })
      expect(registered).toEqual(['report_status', 'revise_document'])
      const to = { heading: '目安', blocks: [{ kind: 'text' as const, text: '数秒で開く' }] }
      expect(await $.tool.call({ tool: 'mcp__software-fleet__revise_document', document, changes: [{ op: 'add', to }] })).toEqual({ result: 'DocumentRevised' })
      expect(writes.at(-1)).toMatchObject({ url: fleet, action: 'set', collection: `fleet/${ship}/deliverables`, doc_id, data: { sections: [to] } })
    })
  }

  test('qa の ship になったセッションは revise_quality を持ち、それで fleet の DB の品質ダッシュボードに書く', { timeoutMs: 15000 }, async ($, on) => {
    const { registered, writes } = world(on)
    await $.tool.call({ tool: 'Skill', skill: 'software-fleet:qa', args: fleet })
    expect(registered).toEqual(['report_status', 'revise_quality'])
    const charter = { aim: '締め後の修正の境界を突く', learned: '締め後でも申請を消せた' }
    expect(await $.tool.call({ tool: 'mcp__software-fleet__revise_quality', charters: [charter] })).toEqual({ result: 'QualityRevised' })
    expect(writes.at(-1)).toMatchObject({ url: fleet, action: 'set', collection: 'fleet/qa/deliverables', doc_id: 'quality', data: { checks: [], findings: [], charters: [charter] } })
  })

  test('ほかの ship は revise_behavior を持たない。LLM が生の ArtifactData で fleet の DB に書くことは拒む', { timeoutMs: 15000 }, async ($, on) => {
    const { registered, writes } = world(on)
    await $.tool.call({ tool: 'Skill', skill: 'software-fleet:requirement', args: fleet })
    expect(registered).toEqual(['report_status', 'revise_requirements'])
    const raw = await $.tool.call({ tool: 'ArtifactData', url: fleet, action: 'set', collection: 'fleet/behavior/deliverables', doc_id: 'event-model', data: {} })
    expect(raw).toEqual({ deny: 'fleet の DB は専用の tool（mcp__software-fleet__*）で書く。生の ArtifactData では書かない' })
    expect(writes).toEqual([])
  })
})
