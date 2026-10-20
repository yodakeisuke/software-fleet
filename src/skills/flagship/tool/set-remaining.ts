import type { Engine, FleetTool, Remaining as RemainingDoc } from '../../../types/fleet'
import { FleetDb } from '../../../fleet/db/fleet-db'
import { JsonSchema } from '../../../fleet/schema/json-schema'
import { Remaining } from '../logic/remaining'

const { text, object } = JsonSchema
const limits = Remaining.limits()

// PR マージまでに残っている大きな塊。ダッシュボードの「あなたが判断すること」の下に出る。件数は logic の Remaining が見る
const spec = {
  name: 'set_remaining',
  description: 'PR マージまでに残っている大きな塊を、今の全体で置き換える。塊はユーザに届く振る舞いの単位で切る（ship や工程では切らない）。終わった塊は外す',
  inputSchema: object({
    chunks: {
      type: 'array',
      description: `大きな塊で ${limits.chunks} 件まで。残りがなければ空`,
      items: object({
        what: text('何が残っているか。1 行'),
        blockedBy: { type: 'array', description: 'この塊を止めているユーザの判断の id（ask_user が返したもの）', items: text() },
      }, ['what']),
    },
  }, ['chunks']),
  isDeferred: false,
}

const run = async (engine: Engine, input: unknown) => {
  const where = FleetDb.paths()
  return JsonSchema.check<RemainingDoc>(spec.inputSchema, input)
    .and(remaining => Remaining.of(remaining))
    .either(remaining => FleetDb.put(engine, where.remaining, remaining, 'RemainingSet'), async error => ({ deny: error }))
}

export const setRemaining = { tool: 'mcp__software-fleet__set_remaining' as const, spec, run } satisfies FleetTool
