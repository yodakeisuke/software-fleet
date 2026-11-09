import type { Ask as AskDoc, Engine, FleetTool, JsonSchemaNode } from '../../../types/fleet'
import { FleetDb } from '../../../fleet/db/fleet-db'
import { JsonSchema } from '../../../fleet/schema/json-schema'
import { Ask } from '../logic/ask'

const { text, object, choice, list } = JsonSchema
const limits = Ask.limits()
// 文と、任意の図
const explain = (description: string): JsonSchemaNode => object({
  text: text(),
  diagram: { type: 'string', description: '等幅で描く図か、viewBox のある <svg>…</svg>。等幅の図は文字のまま出るので HTML を書かない。SVG の色は var(--fg) var(--muted) var(--bg) var(--surface) var(--line) var(--acc) を使う' },
}, ['text'], description)

// ユーザへの判断。入力の形はスキーマ、意味（件数・文字数・推奨・評価表の形）は logic の Ask が見る
const spec = {
  name: 'ask_user',
  description: '無視できないトレードオフやリスクを伴う判断を、ユーザのダッシュボードに上げる。回答はコメントで届く。返る id は record_decision の closes に使う',
  inputSchema: object({
    question: text('ユーザに決めてほしい問い。fleet の中の略語を知らない人が初見で分かる 1 文'),
    background: explain('何の話で、なぜユーザが決めるのか。図があれば diagram に'),
    options: list(object({
      id: text(),
      label: text(`ボタンの文言。${limits.label} 文字まで`),
      consequence: text(`選んだら何が起きるか。${limits.consequence} 文字まで`),
      detail: explain('この選択肢の詳細'),
    }, ['id', 'label', 'consequence', 'detail']), `選択肢。${limits.options.min}〜${limits.options.max} 件`),
    recommended: text('推奨する選択肢の id'),
    evaluation: object({
      axes: list(object({ name: text(), weight: text('重み（高・中・低など）') }, ['name', 'weight'])),
      cells: list(list(object({ rating: choice(['◎', '○', '△', '×']), note: { type: 'string' } }, ['rating', 'note'])), 'options と同じ順で、各行は axes と同じ順'),
    }, ['axes', 'cells'], '複雑な判断だけ付ける評価表'),
  }, ['question', 'background', 'options', 'recommended']),
  isDeferred: false,
}

const run = async (engine: Engine, input: unknown) => {
  const now = await engine.now()
  // 判断の id は、出した時刻から作る
  const id = `ask-${now}`
  const where = FleetDb.paths()
  return JsonSchema.check<AskDoc>(spec.inputSchema, input)
    .and(({ question, background, options, recommended, evaluation }) => Ask.of({ question, background, options, recommended, evaluation }))
    .either(ask => FleetDb.create(engine, `${where.asks}/${id}`, { ...ask, at: new Date(now).toISOString() }, `UserAsked(id: ${id})`), async error => ({ deny: error }))
}

export const askUser = { tool: 'mcp__software-fleet__ask_user' as const, spec, run } satisfies FleetTool
