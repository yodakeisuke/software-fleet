import type { JsonSchema } from '../../engine-protocol'

// --- public interface
export const AskRequest = {
  schema: () => ask(),
}

// --- business rules
// 判断 1 件。選択肢は 2〜4、推奨は選択肢の id のどれか
const ask = (): JsonSchema => ({
  type: 'object',
  required: ['question', 'background', 'options', 'recommended'],
  properties: {
    question: { type: 'string', minLength: 1, description: 'ユーザに決めてほしい問い。1 文' },
    background: explain('なぜユーザが決めるのか。図があれば diagram に'),
    options: { type: 'array', minItems: 2, maxItems: 4, items: option() },
    recommended: { type: 'string', minLength: 1, description: '推奨する選択肢の id' },
    evaluation: evaluation(),
  },
})
// 選択肢。consequence は選んだら何が起きるかの 1 行
const option = (): JsonSchema => ({
  type: 'object',
  required: ['id', 'label', 'consequence', 'detail'],
  properties: {
    id: { type: 'string', minLength: 1 },
    label: { type: 'string', minLength: 1, maxLength: 20, description: 'ボタンの文言。20 文字まで' },
    consequence: { type: 'string', minLength: 1, maxLength: 20, description: '選んだら何が起きるか。20 文字まで' },
    detail: explain('この選択肢の詳細'),
  },
})
// 文と、任意の図。図は HTML か SVG の断片で、ページにそのまま埋め込まれる
const explain = (description: string): JsonSchema => ({
  type: 'object',
  description,
  required: ['text'],
  properties: {
    text: { type: 'string', minLength: 1 },
    diagram: { type: 'string', description: 'HTML か SVG の断片。色はページの変数 var(--fg) var(--muted) var(--bg) var(--surface) var(--line) var(--acc) を使うとライト/ダークに追従する' },
  },
})
// 評価表。複雑な判断だけ。cells は [選択肢][評価軸] の順
const evaluation = (): JsonSchema => ({
  type: 'object',
  description: '複雑な判断だけ付ける評価表',
  required: ['axes', 'cells'],
  properties: {
    axes: { type: 'array', minItems: 1, items: { type: 'object', required: ['name', 'weight'], properties: { name: { type: 'string', minLength: 1 }, weight: { type: 'string', minLength: 1, description: '重み（高・中・低など）' } } } },
    cells: { type: 'array', description: 'options と同じ順で、各行は axes と同じ順', items: { type: 'array', items: cell() } },
  },
})
// 評価表の 1 マス
const cell = (): JsonSchema => ({
  type: 'object',
  required: ['rating', 'note'],
  properties: { rating: { type: 'string', enum: ['◎', '○', '△', '×'] }, note: { type: 'string' } },
})
