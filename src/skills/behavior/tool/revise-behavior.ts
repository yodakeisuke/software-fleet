import type { Behavior, BehaviorInput, Engine, FleetTool, JournalEntry, JsonSchemaNode, Reply, ToolReply } from '../../../types/fleet'
import { FleetDb } from '../../../fleet/db/fleet-db'
import { JsonSchema } from '../../../fleet/schema/json-schema'
import { EventModel } from '../logic/event-model'

const { text, object } = JsonSchema
const tag = (value: string): JsonSchemaNode => ({ type: 'string', enum: [value] })
const words = (description?: string): JsonSchemaNode => ({ type: 'array', ...(description ? { description } : {}), items: text() })
const values = (description?: string): JsonSchemaNode => ({ type: 'object', ...(description ? { description } : {}), additionalProperties: { type: 'string' } })
const list = (description: string, items: JsonSchemaNode): JsonSchemaNode => ({ type: 'array', description, items })
// 同じ定義は $defs に 1 度だけ書き、$ref で指す（LLM が読む tool の説明を短く保つ）
const ref = (name: 'moment' | 'view' | 'readModel' | 'flow' | 'hotspot' | 'occurrence' | 'novelty' | 'sketch' | 'given' | 'event') => JsonSchema.ref(name)
const novelty: JsonSchemaNode = { type: 'string', enum: ['新', '改', '既'], description: '新規・既存の修正・既存（既存は文脈で、例は要らない）' }
const sketch = text('画面の ASCII ワイヤーフレーム（項目・一覧・ボタンの並びまで）')
const event = object({ name: text('過去形の業務の事実'), attrs: words() }, ['name', 'attrs'])
const occurrence = object({ event: text(), values: values() }, ['event', 'values'])
// 例は 1 つの閉じた世界。書いた事実だけが起きている
const given = list('前提として起きている事実。件数のルールは同じ事実を並べて示す', ref('occurrence'))

const trigger: JsonSchemaNode = {
  type: 'object',
  description: '誰がこの時点を起こすか。on は聴く事実で、それより前の時点で起きる',
  oneOf: [
    object({ kind: tag('screen'), actor: text('外部システムでもよい'), screen: text(), sketch: ref('sketch') }, ['kind', 'actor', 'screen', 'sketch']),
    object({ kind: tag('agent'), agent: text(), task: text('推論に委ねること'), sketch: text('指示・制約'), on: text('起こされるきっかけの事実。人が頼むなら省く') }, ['kind', 'agent', 'task', 'sketch']),
    object({ kind: tag('policy'), rule: text('「◯◯が起きたら△△する」'), on: text('聴く事実') }, ['kind', 'rule', 'on']),
  ],
}
const commandTest = object({
  name: text('他の例と違う点'),
  given: ref('given'),
  when: values('コマンドに渡す値。鍵はコマンドの入力か「時刻」'),
  expect: { description: '起きる事実とその値（起きる順。[] は何も起きない）か、拒否なら "error"', oneOf: [tag('error'), { type: 'array', items: ref('occurrence') }] },
}, ['name', 'given', 'when', 'expect'])
const moment = object({
  change: ref('novelty'),
  by: trigger,
  reads: words('読むリードモデル'),
  command: object({ name: text('命令形の動詞句。時点の鍵'), params: words() }, ['name', 'params']),
  aggregate: text('コマンドが当たる集約の短い名前（例: 予約）。集約は一緒に守る不変条件で切り、不変条件は拒否の例で示す'),
  events: list('起きる事実（起きる順。1 つ以上）', ref('event')),
  otherwise: list('起きえた別の結果（却下・失敗など、後で読まれる事実）', ref('event')),
  tests: list('コマンドの例（結合レベルのテスト）。新・改では、起きる事実と別の結果のどれにも、それを起こす例が要る', commandTest),
}, ['change', 'by', 'reads', 'command', 'aggregate', 'events', 'otherwise', 'tests'])
const view = object({
  change: ref('novelty'), actor: text(), screen: text('鍵'), sketch: ref('sketch'), reads: words(), at: text('見る時点のコマンド名'),
}, ['change', 'actor', 'screen', 'sketch', 'reads', 'at'])
const readModel = object({
  change: ref('novelty'),
  name: text('名詞句。リードモデルの鍵'),
  fields: words(),
  sources: words('更新する事実'),
  tests: list('例。新・改では 1 件以上', object({ name: text('他の例と違う点'), given: ref('given'), rows: list('見える行（配列の順が表示の順。[] は何も見えない）', values('鍵は fields')) }, ['name', 'given', 'rows'])),
}, ['change', 'name', 'fields', 'sources', 'tests'])
const flow = object({ name: text('鍵'), from: text('分かれ元の本流のコマンド名') }, ['name', 'from'], '中の時点は moments の add に flow を付けて足す')
const hotspot = object({ question: text('会社の事実で決められないこと。問いの鍵'), assumption: text(), at: text('関わる事実') }, ['question', 'assumption'])
// 今の鍵（which）で指す、足す・直す・消す
const keyed = (description: string, to: JsonSchemaNode, key: string, add: Record<string, JsonSchemaNode> = {}) => list(description, {
  type: 'object',
  oneOf: [
    object({ op: tag('add'), ...add, to }, ['op', 'to']),
    object({ op: tag('replace'), which: text(`今の${key}`), to }, ['op', 'which', 'to']),
    object({ op: tag('remove'), which: text(`今の${key}`) }, ['op', 'which']),
  ],
})

// event model を直す。直す分だけ渡し、今の鍵で指す
const spec = {
  name: 'revise_behavior',
  description: 'event model（時点・読むだけの画面・リードモデル・別の流れ・未決定の問い・1 件分の名乗り）と、その例（Given-When-Then）を足す・直す・消す。直す分だけ渡し、今の鍵で指す。例を直すときも時点（リードモデル）ごと replace。note は変更の記録に残る。replies でユーザのコメントに返信する。1 件でも問題があれば何も書かない',
  inputSchema: { ...object({
    note: text('この変更の理由。1 行'),
    identity: object({ unit: text('1 件分の単位（例: カート 1 回の買い物）'), key: text('束ねる識別子（例: カートID）') }, ['unit', 'key'], '軸は何の 1 件の話か。渡すと置き換える'),
    moments: keyed('時点の変更。軸の並びが時間の順', ref('moment'), 'コマンド名', { flow: text('入れる流れの名前。省くと本流'), after: text('この時点（コマンド名）の直後に入れる。省くと先頭') }),
    views: keyed('読むだけの画面（コマンドを起こさない一覧・ダッシュボード）の変更', ref('view'), '画面の名前'),
    readModels: keyed('リードモデルの変更', ref('readModel'), '名前'),
    flows: keyed('別の流れ（振る舞いを持つ失敗: エラー表示・再試行・打ち切り）の変更。消すと中の時点ごと消える', ref('flow'), '名前'),
    hotspots: keyed('未決定の問いの変更。分かったら remove（理由は note に）', ref('hotspot'), '問い'),
    replies: list('ユーザのコメントへの返信', object({ comment: text('コメントの id'), reply: text('返信。何をどう直したか、どう判断したか') }, ['comment', 'reply'])),
  }, ['note']), $defs: { moment, view, readModel, flow, hotspot, occurrence, novelty, sketch, given, event } },
  isDeferred: false,
}

// 返信先は、ユーザが付けたコメント（無い id には返信しない）
const unknownComments = async (engine: Engine, ids: string[]) => {
  const found = await Promise.all(ids.map(id => (/^[\w-]+$/.test(id) ? FleetDb.read(engine, `${FleetDb.paths().comments}/${id}`) : undefined)))
  return ids.filter((_, at) => found[at] === undefined)
}

// 盤面を直し（何も直さないなら書かない）、変更の記録と返信を書く。1 件でも問題があれば何も書かない
// 盤面を書いた後の書き込みが失敗しても盤面は戻さない。書けなかったものを返し、それだけを送り直させる
const run = async (engine: Engine, input: unknown) => JsonSchema.check<BehaviorInput>(spec.inputSchema, input).either(async ({ note, replies = [], ...changes }): Promise<ToolReply> => {
  const unknown = await unknownComments(engine, replies.map(reply => reply.comment))
  if (unknown.length > 0) return { deny: `返信先のコメントがない: ${unknown.join('、')}` }
  const where = FleetDb.paths()
  const changed = EventModel.changed(changes)
  const revised = changed === '' ? { result: 'BehaviorRevised' }
    : await FleetDb.revise(engine, where.behavior, doc => EventModel.revise({ ...EventModel.empty(), ...(doc as Partial<Behavior> | undefined) }, changes), 'BehaviorRevised')
  if ('deny' in revised) return revised
  const now = await engine.now()
  const at = new Date(now).toISOString()
  const entry = { note, changed, at } satisfies JournalEntry
  const wrote: [string, ToolReply][] = [['変更の記録', await FleetDb.create(engine, `${where.behaviorJournal}/entry-${now}`, entry, 'Journaled')]]
  for (const { comment, reply } of replies) wrote.push([`返信 ${comment}`, await FleetDb.put(engine, `${where.behaviorReplies}/${comment}`, { reply, at } satisfies Reply, 'Replied')])
  const unwritten = wrote.flatMap(([what, reply]) => ('deny' in reply ? [`${what}（${reply.deny}）`] : []))
  return unwritten.length === 0 ? revised : { result: `${revised.result}。ただし書けなかった: ${unwritten.join('、')}` }
}, async error => ({ deny: error }))

export const reviseBehavior = { tool: 'mcp__software-fleet__revise_behavior' as const, spec, run } satisfies FleetTool
