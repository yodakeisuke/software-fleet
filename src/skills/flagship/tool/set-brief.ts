import type { Engine, Fleet, FleetTool } from '../../../types/fleet'
import { FleetDb } from '../../../fleet/fleet-db'
import { JsonSchema } from '../../../fleet/json-schema'

// 依頼の要約。ダッシュボードの一番上に出る
const spec = {
  name: 'set_brief',
  description: '依頼の要約をダッシュボードの一番上に出す',
  inputSchema: JsonSchema.object({ brief: JsonSchema.text('何を誰のために作るか。1〜2 行') }, ['brief']),
  isDeferred: false,
}

const run = async (engine: Engine, input: unknown) => {
  const where = FleetDb.paths()
  return JsonSchema.check<Fleet>(spec.inputSchema, input)
    .either(({ brief }) => FleetDb.put(engine, where.brief, { brief }, 'BriefSet'), async error => ({ deny: error }))
}

export const setBrief = { tool: 'mcp__software-fleet__set_brief' as const, spec, run } satisfies FleetTool
