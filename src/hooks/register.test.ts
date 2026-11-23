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
  // DB に在る文書（"collection/id" → 中身）。置いたものだけ、core が返す形（text）で読める
  const docs = new Map<string, unknown>()
  on('tool.call', { tool: 'ArtifactData' }, async (_$, e) => {
    writes.push(e as Record<string, unknown>)
    const doc = e.action === 'get' ? docs.get(`${e.collection}/${e.doc_id}`) : undefined
    return doc === undefined ? { result: '' } : { result: '', text: `{"id":"${e.doc_id}","data":${JSON.stringify(doc)},"version":1}` }
  })
  // いまのコード（プロジェクトのルートは /repo）。無いファイルは読めない
  const code = new Map<string, string>()
  on('session.root', async () => ({ value: '/repo' }))
  on('fs.read', async (_$, e) => {
    const text = code.get(e.path)
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  return { registered, writes, state, code, docs }
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

  test('set-afloat が Skill で呼ばれても（command.run は起きない）flagship の tool を出す。乗るのはダッシュボードの publish のとき', { timeoutMs: 15000 }, async ($, on) => {
    const { registered, state } = world(on)
    await $.tool.call({ tool: 'Skill', skill: 'software-fleet:set-afloat', args: '経費精算' })
    expect(registered).toEqual(['set_brief', 'ask_user', 'record_decision', 'set_remaining'])
    expect(state.has('fleet')).toBe(false)
  })

  test('Skill の名前は前後の空白と先頭の / を落として引く（/software-fleet:qa でも qa として乗る）', { timeoutMs: 15000 }, async ($, on) => {
    const { registered, state } = world(on)
    await $.tool.call({ tool: 'Skill', skill: ' /software-fleet:qa', args: fleet })
    expect(registered).toEqual(['report_status', 'set_links', 'revise_quality'])
    expect(state.get('fleet')).toEqual({ url: fleet, role: 'qa' })
  })

  test('behavior の ship になったセッションは revise_behavior を持ち、それで fleet の DB の event model に書く', { timeoutMs: 15000 }, async ($, on) => {
    const { registered, writes } = world(on)
    await $.tool.call({ tool: 'Skill', skill: 'software-fleet:behavior', args: fleet })
    expect(registered).toEqual(['report_status', 'set_links', 'revise_behavior'])
    expect(await $.tool.call({ tool: 'mcp__software-fleet__revise_behavior', note: '申請を足す', moments: [{ op: 'add', to: moment }] })).toEqual({ result: 'BehaviorRevised' })
    expect(writes.find(call => call.doc_id === 'event-model' && call.action === 'set')).toMatchObject({ url: fleet, action: 'set', collection: 'fleet/behavior/deliverables', data: { moments: [moment], views: [], readModels: [], flows: [], hotspots: [] } })
    expect(writes.at(-1)).toMatchObject({ url: fleet, action: 'set', collection: 'fleet/behavior/journal', data: { note: '申請を足す', changed: '時点 +1 ~0 -0' } })
  })

  test('coder の ship になったセッションは set_links と revise_model を持ち、それで fleet の DB のその ship のリンクに PR を、設計図の文書に設計図を書く', { timeoutMs: 15000 }, async ($, on) => {
    const { registered, writes } = world(on)
    await $.tool.call({ tool: 'Skill', skill: 'software-fleet:coder', args: fleet })
    expect(registered).toEqual(['report_status', 'set_links', 'revise_model'])
    const links = [{ url: 'https://github.com/owner/repo/pull/12', label: 'PR' }]
    expect(await $.tool.call({ tool: 'mcp__software-fleet__set_links', links })).toEqual({ result: 'LinksSet' })
    expect(writes.at(-1)).toMatchObject({ url: fleet, action: 'set', collection: 'fleet/ships/links', doc_id: 'coder', data: { links } })
    expect(await $.tool.call({ tool: 'mcp__software-fleet__revise_model', name: '注文' })).toEqual({ result: 'ModelRevised' })
    expect(writes.at(-1)).toMatchObject({ url: fleet, action: 'set', collection: 'fleet/coder/deliverables', doc_id: 'model', data: { name: '注文' } })
  })

  test('coder の地図の実線は、いまのコードと照合した型だけ。コードから消えたら、設計図も収束の報告も拒む', { timeoutMs: 15000 }, async ($, on) => {
    const { writes, code, docs } = world(on)
    await $.tool.call({ tool: 'Skill', skill: 'software-fleet:coder', args: fleet })
    const types = [{ id: 'order', name: '注文', world: 'domain' as const, form: 'value' as const, change: '新' as const, code: 'src/order.ts#OrderState', objects: [{ id: 'v', name: '注文' }] }]
    expect(await $.tool.call({ tool: 'mcp__software-fleet__revise_model', name: '注文', types })).toEqual({ deny: '型「注文」の code のファイル「src/order.ts」が読めない（プロジェクトのルートからのパス）' })
    code.set('/repo/src/order.ts', 'export type OrderState = Draft | Placed')
    expect(await $.tool.call({ tool: 'mcp__software-fleet__revise_model', name: '注文', types })).toEqual({ result: 'ModelRevised' })
    docs.set('fleet/coder/deliverables/model', writes.at(-1)?.data)
    expect(await $.tool.call({ tool: 'mcp__software-fleet__report_status', status: { state: 'converged' } })).toMatchObject({ result: expect.stringContaining('StatusReported') })
    code.set('/repo/src/order.ts', 'export type OrderStatus = Draft | Placed')
    expect(await $.tool.call({ tool: 'mcp__software-fleet__report_status', status: { state: 'converged' } })).toEqual({ deny: '地図がいまのコードとずれている。revise_model で直してから報告する: 型「注文」の code の名前「OrderState」が src/order.ts に無い' })
    expect(await $.tool.call({ tool: 'mcp__software-fleet__report_status', status: { state: 'working', doing: '地図を直す' } })).toEqual({ result: 'StatusReported' })
  })

  for (const [ship, document, doc_id] of [['cs', 'guide', 'guide'], ['ops', 'operationsDesign', 'operations-design']] as const) {
    test(`${ship} の ship になったセッションは revise_document を持ち、それで fleet の DB に文書を書く`, { timeoutMs: 15000 }, async ($, on) => {
      const { registered, writes } = world(on)
      await $.tool.call({ tool: 'Skill', skill: `software-fleet:${ship}`, args: fleet })
      expect(registered).toEqual(['report_status', 'set_links', 'revise_document'])
      const to = { heading: '目安', blocks: [{ kind: 'text' as const, text: '数秒で開く' }] }
      expect(await $.tool.call({ tool: 'mcp__software-fleet__revise_document', document, changes: [{ op: 'add', to }] })).toEqual({ result: 'DocumentRevised' })
      expect(writes.at(-1)).toMatchObject({ url: fleet, action: 'set', collection: `fleet/${ship}/deliverables`, doc_id, data: { sections: [to] } })
    })
  }

  test('qa の ship になったセッションは revise_quality を持ち、それで fleet の DB の品質ダッシュボードに書く', { timeoutMs: 15000 }, async ($, on) => {
    const { registered, writes } = world(on)
    await $.tool.call({ tool: 'Skill', skill: 'software-fleet:qa', args: fleet })
    expect(registered).toEqual(['report_status', 'set_links', 'revise_quality'])
    const charter = { aim: '締め後の修正の境界を突く', learned: '締め後でも申請を消せた' }
    expect(await $.tool.call({ tool: 'mcp__software-fleet__revise_quality', charters: [charter] })).toEqual({ result: 'QualityRevised' })
    expect(writes.at(-1)).toMatchObject({ url: fleet, action: 'set', collection: 'fleet/qa/deliverables', doc_id: 'quality', data: { checks: [], findings: [], charters: [charter] } })
  })

  test('requirement の ship になったセッションは revise_requirements を持ち、それで fleet の DB の要求リストに書く', { timeoutMs: 15000 }, async ($, on) => {
    const { writes } = world(on)
    await $.tool.call({ tool: 'Skill', skill: 'software-fleet:requirement', args: fleet })
    const to = { kind: '機能' as const, change: '新' as const, who: '経理担当は', can: '予算を承認できる', tests: [{ act: '予算を承認する', evidence: '一覧に載る' }] }
    expect(await $.tool.call({ tool: 'mcp__software-fleet__revise_requirements', changes: [{ op: 'add', to }] })).toEqual({ result: 'RequirementsRevised' })
    expect(writes.at(-1)).toMatchObject({ url: fleet, action: 'set', collection: 'fleet/requirement/deliverables', doc_id: 'requirements', data: { requirements: [to] } })
  })

  test('ほかの ship は revise_behavior を持たない。LLM が生の ArtifactData で fleet の DB に書くことは拒む', { timeoutMs: 15000 }, async ($, on) => {
    const { registered, writes } = world(on)
    await $.tool.call({ tool: 'Skill', skill: 'software-fleet:requirement', args: fleet })
    expect(registered).toEqual(['report_status', 'set_links', 'revise_requirements'])
    const raw = await $.tool.call({ tool: 'ArtifactData', url: fleet, action: 'set', collection: 'fleet/behavior/deliverables', doc_id: 'event-model', data: {} })
    expect(raw).toEqual({ deny: 'fleet の DB は専用の tool（mcp__software-fleet__*）で書く。生の ArtifactData では書かない' })
    expect(writes).toEqual([])
  })

  test('ユーザが /software-fleet:<ship> を fleet の URL 付きで打つと、そのセッションがその ship として乗る', { timeoutMs: 15000 }, async ($, on) => {
    const { registered, state } = world(on)
    on('command.run', async () => ({}))
    expect(await $.command.run({ command: 'software-fleet:qa', args: `${fleet} 経費精算` } as CommandRunInput)).not.toHaveProperty('context')
    expect(registered).toEqual(['report_status', 'set_links', 'revise_quality'])
    expect(state.get('fleet')).toEqual({ url: fleet, role: 'qa' })
  })

  test('URL なしで打つと fleet なしの単独で起きる。後からダッシュボードを publish すると、その ship として乗り、set_brief も持つ', { timeoutMs: 15000 }, async ($, on) => {
    const { registered, writes, state } = world(on)
    on('command.run', async () => ({}))
    // 実物の結果は core が text（LLM が読む文）を付ける
    on('tool.call', { tool: 'Artifact' }, async () => ({ result: '', text: `published ${fleet}` }))
    const ran = await $.command.run({ command: 'software-fleet:coder', args: '経費精算' } as CommandRunInput)
    // 指示が名指しするダッシュボードのファイル
    const dashboard = /\S+\/skills\/flagship\/dashboard\.html/.exec(ran.context?.[0] ?? '')?.[0]
    expect(ran.context).toHaveLength(1)
    expect(registered).toEqual([])
    await $.tool.call({ tool: 'Artifact', file_path: dashboard })
    expect(state.get('fleet')).toEqual({ url: fleet, role: 'coder' })
    expect(registered).toEqual(['set_brief', 'report_status', 'set_links', 'revise_model'])
    expect(writes.at(-1)).toMatchObject({ url: fleet, action: 'set', collection: 'fleet', doc_id: 'db-paths' })
    expect(await $.tool.call({ tool: 'mcp__software-fleet__set_brief', brief: '経費精算を作る' })).toEqual({ result: 'BriefSet' })
  })
})
