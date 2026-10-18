import type { EngineInterface, MatchedHook, ToolCallResult, ToolSpec } from 'claude-code'
import type { Ask as AskDoc, Decision as DecisionDoc, Fleet, JsonSchemaNode, Review, Status as StatusDoc } from '../types/fleet'
import { Ask } from '../logic/ask/ask'
import { Decision } from '../logic/decision/decision'
import { Ship } from '../logic/ship/ship'
import { Status } from '../logic/status/status'
import { Turn } from '../logic/turn/turn'
import { ArtifactDb } from './fleet-db'
import { JsonSchema } from './json-schema'

// fleet の専用 tool の定義。入力スキーマは形（型・必須・空でない・enum）だけを持ち、mod はこれで入力も検査する。意味の検査は logic
const limits = Ask.limits()
const text = (description?: string): JsonSchemaNode => ({ type: 'string', minLength: 1, ...(description ? { description } : {}) })
const object = (properties: Record<string, JsonSchemaNode>, required: string[], description?: string): JsonSchemaNode =>
  ({ type: 'object', properties, required, ...(description ? { description } : {}) })

// 文と、任意の図。図は HTML か SVG の断片で、ページにそのまま埋め込まれる
const explain = (description: string) => object({
  text: text(),
  diagram: { type: 'string', description: 'HTML か SVG の断片。色はページの変数 var(--fg) var(--muted) var(--bg) var(--surface) var(--line) var(--acc) を使うとライト/ダークに追従する' },
}, ['text'], description)

export const setBriefTool = {
  name: 'set_brief',
  description: '依頼の要約をダッシュボードの一番上に出す',
  inputSchema: object({ brief: text('何を誰のために作るか。1〜2 行') }, ['brief']),
  isDeferred: false,
} satisfies ToolSpec

export const askUserTool = {
  name: 'ask_user',
  description: '無視できないトレードオフやリスクを伴う判断を、ユーザのダッシュボードに上げる。回答はコメントで届く。返る id は record_decision の closes に使う',
  inputSchema: object({
    question: text('ユーザに決めてほしい問い。1 文'),
    background: explain('なぜユーザが決めるのか。図があれば diagram に'),
    options: {
      type: 'array',
      description: `選択肢。${limits.options.min}〜${limits.options.max} 件`,
      items: object({
        id: text(),
        label: text(`ボタンの文言。${limits.label} 文字まで`),
        consequence: text(`選んだら何が起きるか。${limits.consequence} 文字まで`),
        detail: explain('この選択肢の詳細'),
      }, ['id', 'label', 'consequence', 'detail']),
    },
    recommended: text('推奨する選択肢の id'),
    evaluation: object({
      axes: { type: 'array', items: object({ name: text(), weight: text('重み（高・中・低など）') }, ['name', 'weight']) },
      cells: { type: 'array', description: 'options と同じ順で、各行は axes と同じ順', items: { type: 'array', items: object({ rating: { type: 'string', enum: ['◎', '○', '△', '×'] }, note: { type: 'string' } }, ['rating', 'note']) } },
    }, ['axes', 'cells'], '複雑な判断だけ付ける評価表'),
  }, ['question', 'background', 'options', 'recommended']),
  isDeferred: false,
} satisfies ToolSpec

export const recordDecisionTool = {
  name: 'record_decision',
  description: 'flagship が決めたことを残す。ユーザの判断を受けて決めたなら closes にその id',
  inputSchema: object({ what: text('決めたこと。1 行'), why: text('なぜ。1 行'), closes: text('この決定で閉じる判断の id（ask_user が返したもの）') }, ['what', 'why']),
  isDeferred: false,
} satisfies ToolSpec

// state の値で分かれる形の 1 つ
const state = (name: string, fields: Record<string, JsonSchemaNode>) => object({ state: { type: 'string', enum: [name] }, ...fields }, ['state', ...Object.keys(fields)])

export const reportStatusTool = {
  name: 'report_status',
  description: 'この ship の今をダッシュボードに出す。状態が変わるたびに呼ぶ',
  // 入力の一番外側には oneOf を置けないので { status } で包む
  inputSchema: object({
    status: {
      type: 'object',
      oneOf: [
        state('working', { doing: text('今していること。1 行') }),
        state('converged', {}),
        state('stuck', { reason: text('なぜ進めないか。1 行') }),
        state('waiting', { on: { type: 'string', enum: [...Ship.names(), 'user'], description: '誰を待っているか' }, what: text('何を待っているか。1 行') }),
      ],
    },
  }, ['status']),
  isDeferred: false,
} satisfies ToolSpec

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
