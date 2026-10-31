import type { Engine, FleetTool, PullRequest } from '../../../types/fleet'
import { FleetDb } from '../../../fleet/db/fleet-db'
import { JsonSchema } from '../../../fleet/schema/json-schema'

const { text, object } = JsonSchema

// 作った PR。ダッシュボードの implementation のページにリンクで出る。ユーザが押すので、GitHub の PR の URL だけを通す
const spec = {
  name: 'set_pull_request',
  description: '作った PR をダッシュボードに出す',
  inputSchema: object({ url: { ...text('GitHub の PR の URL'), pattern: '^https://github\\.com/[\\w-]+/[\\w.-]+/pull/\\d+$' } }, ['url']),
  isDeferred: false,
}

const run = async (engine: Engine, input: unknown) => JsonSchema.check<PullRequest>(spec.inputSchema, input)
  .either(pullRequest => FleetDb.put(engine, FleetDb.paths().pullRequest, pullRequest, 'PullRequestSet'), async error => ({ deny: error }))

export const setPullRequest = { tool: 'mcp__software-fleet__set_pull_request' as const, spec, run } satisfies FleetTool
