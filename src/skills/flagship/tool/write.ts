import type { EngineInterface, MatchedHook, ToolCallResult } from 'claude-code'
import type { Review } from '../../../engine-protocol'
import { Ask } from '../../../logic/ask/ask'
import { Flagship } from '../../../logic/flagship/flagship'
import { FleetDb } from '../../../logic/fleet-db/fleet-db'
import { Ship } from '../../../logic/ship/ship'
import { Status } from '../../../logic/status/status'
import { Turn } from '../../../logic/turn/turn'

const fleet = { plugin: 'software-fleet', key: 'fleet' } as const

// fleet の DB を書く専用 tool。文書 ID・if_version・時刻・ship 名はここで付け、LLM には書かせない

// flagship: 依頼の要約
export const setBrief: MatchedHook<'tool.call', { tool: 'mcp__software-fleet__set_brief' }> = async ($, e) =>
  Flagship.brief(e).either(brief => put($, { collection: 'fleet', id: 'flagship', data: brief }, 'BriefSet'), refuse)

// flagship: ユーザへの判断
export const askUser: MatchedHook<'tool.call', { tool: 'mcp__software-fleet__ask_user' }> = async ($, e) => {
  const now = await $.clock.now()
  const id = Ask.id(now)
  return Ask.of(e).either(ask => create($, { collection: 'fleet/flagship/asks', id, data: { ...ask, at: iso(now) } }, `UserAsked(id: ${id})`), refuse)
}

// flagship: 決めたこと
export const recordDecision: MatchedHook<'tool.call', { tool: 'mcp__software-fleet__record_decision' }> = async ($, e) => {
  const now = await $.clock.now()
  return Flagship.decision(e).either(decision => create($, { collection: 'fleet/flagship/decisions', id: Flagship.decisionId(now), data: { ...decision, at: iso(now) } }, 'DecisionRecorded'), refuse)
}

// ship: 今の状態。収束してレビュー待ちになったら、そう返す
export const reportStatus: MatchedHook<'tool.call', { tool: 'mcp__software-fleet__report_status' }> = async ($, e) => {
  const { value: session } = await $.state.get(fleet)
  const now = await $.clock.now()
  const status = Status.of(e).and(parsed => Ship.of(`software-fleet:${session?.role}`).and(ship => ({ ship, doc: { ...parsed, since: iso(now) } })))
  return status.either(async ({ ship, doc }) => {
    const wrote = await put($, { collection: 'fleet', id: ship, data: doc }, 'StatusReported')
    const review = await read($, 'fleet/user/reviews', ship)
    return wrote.deny === undefined && Turn.awaiting(ship, doc, review as Review | undefined) ? { result: 'StatusReported, awaiting review' } : wrote
  }, refuse)
}

const refuse = async (error: string): Promise<ToolCallResult> => ({ deny: error })
const iso = (now: number) => new Date(now).toISOString()

// 文書を 1 つ書く。今の版を読んでから、その版に固定して書く（古い版への書き込みは DB が拒む）
const put = async ($: EngineInterface, target: { collection: string; id: string; data: object }, done: string): Promise<ToolCallResult> => {
  const { value: session } = await $.state.get(fleet)
  if (session === undefined) return { deny: 'このセッションは fleet に乗っていない' }
  const got = await $.tool.call({ tool: 'ArtifactData', action: 'get', url: session.url, collection: target.collection, doc_id: target.id })
  if (got.isError === true) return { deny: got.text ?? `${target.collection}/${target.id} を読めなかった` }
  const version = (await FleetDb.stored(got.text ?? '')).either(doc => doc?.version, () => undefined)
  const wrote = await $.tool.call({
    tool: 'ArtifactData', action: 'set', url: session.url, collection: target.collection, doc_id: target.id, data: target.data,
    ...(version === undefined ? {} : { if_version: version }),
  })
  return wrote.isError === true || wrote.deny !== undefined ? { deny: wrote.deny ?? wrote.text ?? `${target.collection}/${target.id} を書けなかった` } : { result: done }
}

// 新しい文書を 1 つ書く。id は時刻から作るので、まだない
const create = async ($: EngineInterface, target: { collection: string; id: string; data: object }, done: string): Promise<ToolCallResult> => {
  const { value: session } = await $.state.get(fleet)
  if (session === undefined) return { deny: 'このセッションは fleet に乗っていない' }
  const wrote = await $.tool.call({ tool: 'ArtifactData', action: 'set', url: session.url, collection: target.collection, doc_id: target.id, data: target.data })
  return wrote.isError === true || wrote.deny !== undefined ? { deny: wrote.deny ?? wrote.text ?? `${target.collection}/${target.id} を書けなかった` } : { result: done }
}

// 文書を 1 つ読む。なければ undefined
const read = async ($: EngineInterface, collection: string, id: string) => {
  const { value: session } = await $.state.get(fleet)
  const got = session && (await $.tool.call({ tool: 'ArtifactData', action: 'get', url: session.url, collection, doc_id: id }))
  return (await FleetDb.stored(got?.text ?? '')).either(doc => doc?.data, () => undefined)
}
