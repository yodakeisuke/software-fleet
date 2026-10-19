import type { Engine, FleetTool, Guide, GuideDecision, GuideRevision } from '../../../types/fleet'
import { FleetDb } from '../../../fleet/fleet-db'
import { JsonSchema } from '../../../fleet/json-schema'
import { Result } from '../../../fleet/logic/result'

const { text, object } = JsonSchema
// ガイドの HTML ファイルを読んで、決定ログと一緒に出す。HTML を tool の入力に書き写させない（長い文書を毎回出し直させない）
const spec = {
  name: 'revise_guide',
  description: 'ヘルプガイドの HTML ファイルを読み、決定ログと一緒にページへ出す（前に出したものと置き換わる）。ページはその HTML を iframe にそのまま入れる（script は動かない）',
  inputSchema: object({
    file: text('ガイドの HTML ファイル（.html）のパス'),
    decisions: {
      type: 'array',
      description: '決定ログ。聞かずに自分で決めた仕様を 1 件ずつ。言い回しや体裁の選択は入れない',
      items: object({ issue: text('論点'), decision: text('決めたこと'), why: text('聞かずに決めた理由') }, ['issue', 'decision', 'why']),
    },
  }, ['file', 'decisions']),
  isDeferred: false,
}

// mod の読み込みは Read の権限（deny など）を通らない。HTML のファイルだけを読み、ほかのファイルを DB へ持ち出す道にしない
const readable = (file: string) => file.endsWith('.html')
// tool の呼び出しの付帯情報を持ち込まないよう、型にある項目だけを残す
const pick = ({ issue, decision, why }: GuideDecision): GuideDecision => ({ issue, decision, why })

// 前に出したガイドを、読んだファイルの中身で置き換える。読めなければ何も書かない
const run = async (engine: Engine, input: unknown) => JsonSchema.check<GuideRevision>(spec.inputSchema, input).either(async ({ file, decisions }) => {
  if (!readable(file)) return { deny: `ガイドは .html のファイルで渡す: ${file}` }
  return (await Result.given(engine.read(file))).either(
    html => FleetDb.put(engine, FleetDb.paths().guide, { html, decisions: decisions.map(pick) } satisfies Guide, 'GuideRevised'),
    async error => ({ deny: `ガイドのファイルを読めない（${file}）: ${error}` }))
}, async error => ({ deny: error }))

export const reviseGuide = { tool: 'mcp__software-fleet__revise_guide' as const, spec, run } satisfies FleetTool
