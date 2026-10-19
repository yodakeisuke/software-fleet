import type { Engine, Fleet, FleetTool } from '../../../types/fleet'
import { Result } from '../../../fleet/logic/result'
import { FleetDb } from '../../../fleet/fleet-db'
import { JsonSchema } from '../../../fleet/json-schema'

const { text, object } = JsonSchema

// 依頼の要約と「要は何か」。要約はダッシュボードの一番上に、課題と解決の対は requirement のページの先頭に出る
const spec = {
  name: 'set_brief',
  description: '依頼の要約と、課題と解決の対を出す。problems を省くと今の表を残し、渡すと置き換える',
  inputSchema: object({
    brief: text('何を誰のために作るか。1〜2 行'),
    problems: { type: 'array', description: '課題 1 つに解決 1 つ。後から足してよい', items: object({ problem: text('誰が何に困っているか'), solution: text('それをどう解くか') }, ['problem', 'solution']) },
  }, ['brief']),
  isDeferred: false,
}

const run = async (engine: Engine, input: unknown) => {
  const where = FleetDb.paths()
  return JsonSchema.check<Fleet>(spec.inputSchema, input)
    .either(({ brief, problems }) => FleetDb.revise(engine, where.brief, doc => Result.given({
      brief,
      problems: problems ?? (doc as Fleet | undefined)?.problems ?? [],
    }), 'BriefSet'), async error => ({ deny: error }))
}

export const setBrief = { tool: 'mcp__software-fleet__set_brief' as const, spec, run } satisfies FleetTool
