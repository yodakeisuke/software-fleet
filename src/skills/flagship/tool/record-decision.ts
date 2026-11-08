import type { Decision, Engine, FleetTool, JsonSchemaNode } from '../../../types/fleet'
import { FleetDb } from '../../../fleet/db/fleet-db'
import { JsonSchema } from '../../../fleet/schema/json-schema'

const { text, object } = JsonSchema

// 根拠はポインタ 1 つ: URL か、commit の SHA か、DB の文書の id（collection/id）。文章は受け取らない
const pointer: JsonSchemaNode = { type: 'string', pattern: '^(https?://\\S+|[0-9a-f]{7,40}|[\\w.-]+(/[\\w.-]+)+)$', description: '根拠を指すポインタ 1 つ。URL か commit の SHA か DB の文書の id。文章は書かない' }

// flagship が決めたこと。ユーザの判断を受けて決めたなら、その判断の id を closes に。決定は消さず、変えるなら supersedes で前の決定を指す新しい決定を足す
const spec = {
  name: 'record_decision',
  description: 'flagship が決めたことを残す。ユーザの判断を受けて決めたなら closes にその id。前の決定を変えるなら supersedes にその id（返る id）',
  inputSchema: object({
    what: text('決めたこと。1 行'),
    why: text('なぜ。1 行'),
    closes: text('この決定で閉じる判断の id（ask_user が返したもの）'),
    evidence: pointer,
    supersedes: { type: 'string', pattern: '^decision-\\d+$', description: 'この決定が置き換える前の決定の id（record_decision が返したもの）' },
  }, ['what', 'why']),
  isDeferred: false,
}

const run = async (engine: Engine, input: unknown) => {
  const now = await engine.now()
  // 決定の id は、記録した時刻から作る
  const id = `decision-${now}`
  const where = FleetDb.paths()
  return JsonSchema.check<Decision>(spec.inputSchema, input)
    .either(decision => FleetDb.create(engine, `${where.decisions}/${id}`, { ...decision, at: new Date(now).toISOString() }, `DecisionRecorded(id: ${id})`), async error => ({ deny: error }))
}

export const recordDecision = { tool: 'mcp__software-fleet__record_decision' as const, spec, run } satisfies FleetTool
