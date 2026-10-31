import type { Engine, FleetTool, PullRequest as PullRequestDoc } from '../../../types/fleet'
import { FleetDb } from '../../../fleet/db/fleet-db'
import { JsonSchema } from '../../../fleet/schema/json-schema'
import { PullRequest } from '../logic/pull-request'

const { text, object } = JsonSchema

// 作った PR。ダッシュボードの implementation のページにリンクで出る
const spec = {
  name: 'set_pull_request',
  description: '作った PR をダッシュボードに出す。ユーザはそこからスマホで PR を開いてマージする',
  inputSchema: object({ url: text('GitHub の PR の URL') }, ['url']),
  isDeferred: false,
}

const run = async (engine: Engine, input: unknown) => {
  const where = FleetDb.paths()
  return JsonSchema.check<PullRequestDoc>(spec.inputSchema, input)
    .and(pullRequest => PullRequest.of(pullRequest))
    .either(pullRequest => FleetDb.put(engine, where.pullRequest, pullRequest, 'PullRequestSet'), async error => ({ deny: error }))
}

export const setPullRequest = { tool: 'mcp__software-fleet__set_pull_request' as const, spec, run } satisfies FleetTool
