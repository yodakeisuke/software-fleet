import type { EngineInterface, MatchedHook, ToolCallResult } from 'claude-code'
import type { Ask as AskDoc, Decision as DecisionDoc, Fleet, Review, Status as StatusDoc } from '../../../types/fleet'
import { ArtifactDb } from './artifact-db'
import { JsonSchema } from './json-schema'
import { Ask } from '../../../logic/ask/ask'
import { Decision } from '../../../logic/decision/decision'
import { Ship } from '../../../logic/ship/ship'
import { Status } from '../../../logic/status/status'
import { Turn } from '../../../logic/turn/turn'
import { askUserTool, recordDecisionTool, reportStatusTool, setBriefTool } from './tools'

const fleet = { plugin: 'software-fleet', key: 'fleet' } as const

// fleet の DB を書く専用 tool。入力の形は tool のスキーマ、意味は logic で検査し、文書 ID・if_version・時刻・ship 名はここで付ける

// flagship: 依頼の要約
export const setBrief: MatchedHook<'tool.call', { tool: 'mcp__software-fleet__set_brief' }> = async ($, e) =>
  JsonSchema.check<Fleet>(setBriefTool.inputSchema, e).either(({ brief }) => put($, { collection: 'fleet', id: 'flagship', data: { brief } }, 'BriefSet'), refuse)

// flagship: ユーザへの判断
export const askUser: MatchedHook<'tool.call', { tool: 'mcp__software-fleet__ask_user' }> = async ($, e) => {
  const now = await $.clock.now()
  const id = Ask.id(now)
  return JsonSchema.check<AskDoc>(askUserTool.inputSchema, e)
    .and(({ question, background, options, recommended, evaluation }) => Ask.of({ question, background, options, recommended, evaluation }))
    .either(ask => create($, { collection: 'fleet/flagship/asks', id, data: { ...ask, at: iso(now) } }, `UserAsked(id: ${id})`), refuse)
}

// flagship: 決めたこと
export const recordDecision: MatchedHook<'tool.call', { tool: 'mcp__software-fleet__record_decision' }> = async ($, e) => {
  const now = await $.clock.now()
  return JsonSchema.check<DecisionDoc>(recordDecisionTool.inputSchema, e)
    .either(({ what, why, closes }) => create($, { collection: 'fleet/flagship/decisions', id: Decision.id(now), data: { what, why, closes, at: iso(now) } }, 'DecisionRecorded'), refuse)
}

// ship: 今の状態。収束してレビュー待ちになったら、そう返す
export const reportStatus: MatchedHook<'tool.call', { tool: 'mcp__software-fleet__report_status' }> = async ($, e) => {
  const { value: session } = await $.state.get(fleet)
  const now = await $.clock.now()
  const reported = JsonSchema.check<{ status: StatusDoc }>(reportStatusTool.inputSchema, e)
    .and(({ status }) => Ship.of(`software-fleet:${session?.role}`).and(ship => ({ ship, doc: Status.since(pick(status), iso(now)) })))
  return reported.either(async ({ ship, doc }) => {
    const wrote = await put($, { collection: 'fleet', id: ship, data: doc }, 'StatusReported')
    const review = await read($, 'fleet/user/reviews', ship)
    return wrote.deny === undefined && Turn.awaiting(ship, doc, review as Review | undefined) ? { result: 'StatusReported, awaiting review' } : wrote
  }, refuse)
}

const refuse = async (error: string): Promise<ToolCallResult> => ({ deny: error })
const iso = (now: number) => new Date(now).toISOString()
// tool の呼び出しの付帯情報を持ち込まないよう、Status の項目だけを残す
const pick = (status: StatusDoc) => Object.fromEntries(Object.entries(status).filter(([key]) => ['state', 'doing', 'reason', 'on', 'what'].includes(key))) as StatusDoc

// 文書を 1 つ書く。今の版を読んでから、その版に固定して書く（古い版への書き込みは DB が拒む）
const put = async ($: EngineInterface, target: { collection: string; id: string; data: object }, done: string): Promise<ToolCallResult> => {
  const { value: session } = await $.state.get(fleet)
  if (session === undefined) return { deny: 'このセッションは fleet に乗っていない' }
  const got = await $.tool.call({ tool: 'ArtifactData', action: 'get', url: session.url, collection: target.collection, doc_id: target.id })
  if (got.isError === true) return { deny: got.text ?? `${target.collection}/${target.id} を読めなかった` }
  const version = (await ArtifactDb.stored(got.text ?? '')).either(doc => doc?.version, () => undefined)
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
  return (await ArtifactDb.stored(got?.text ?? '')).either(doc => doc?.data, () => undefined)
}
