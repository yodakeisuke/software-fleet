import type { ToolSpec } from 'claude-code'
import type { JsonSchemaNode } from '../../../types/fleet'
import { Ask } from '../../../logic/ask/ask'
import { Ship } from '../../../logic/ship/ship'

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
