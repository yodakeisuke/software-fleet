import type { Decision, Engine, FleetTool } from '../../../types/fleet'
import { FleetDb } from '../../../fleet/db/fleet-db'
import { JsonSchema } from '../../../fleet/schema/json-schema'

const { text, object } = JsonSchema

// flagship が決めたこと。ユーザの判断を受けて決めたなら、その判断の id を closes に
const spec = {
  name: 'record_decision',
  description: 'flagship が決めたことを残す。ユーザの判断を受けて決めたなら closes にその id',
  inputSchema: object({ what: text('決めたこと。1 行'), why: text('なぜ。1 行'), closes: text('この決定で閉じる判断の id（ask_user が返したもの）') }, ['what', 'why']),
  isDeferred: false,
}

const run = async (engine: Engine, input: unknown) => {
  const now = await engine.now()
  const where = FleetDb.paths()
  // 決定の id は、記録した時刻から作る
  return JsonSchema.check<Decision>(spec.inputSchema, input)
    .either(({ what, why, closes }) => FleetDb.create(engine, `${where.decisions}/decision-${now}`, { what, why, closes, at: new Date(now).toISOString() }, 'DecisionRecorded'), async error => ({ deny: error }))
}

export const recordDecision = { tool: 'mcp__software-fleet__record_decision' as const, spec, run } satisfies FleetTool
