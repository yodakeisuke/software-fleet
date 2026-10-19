import type { Engine, FleetTool, JsonSchemaNode, RequirementChange, Requirements as RequirementsDoc } from '../../../types/fleet'
import { FleetDb } from '../../../fleet/fleet-db'
import { JsonSchema } from '../../../fleet/json-schema'
import { Requirements } from '../logic/requirements'

const { text, object } = JsonSchema
const op = (name: string, fields: Record<string, JsonSchemaNode>) => object({ op: { type: 'string', enum: [name] }, ...fields }, ['op', ...Object.keys(fields)])
// 今の文で要求を指す
const which = object({ who: text(), can: text() }, ['who', 'can'], '指す要求の、今の who と can')
const requirement = object({
  kind: { type: 'string', enum: [...Requirements.kinds()], description: '区分。非機能はセキュリティから考える' },
  change: { type: 'string', enum: ['新', '改'], description: '新規か、既存の変更か' },
  who: text('誰が。「経理担当は」のように「は」「でも」まで'),
  can: text('何をできる（できない）'),
  tests: {
    type: 'array',
    description: 'この要求の裏返しのテスト（要求レベル）。1 件以上',
    items: object({ act: text('何をするか'), evidence: text('何が取れたら合格か（取るべき証跡）') }, ['act', 'evidence']),
  },
}, ['kind', 'change', 'who', 'can', 'tests'])

// 要求リストを直す。直す分だけ渡し、要求は今の who と can で指す
const spec = {
  name: 'revise_requirements',
  description: '要求とその裏返しのテストを足す・直す・消す。直す分だけ渡し、今の who と can で指す。テストを直すときも要求ごと replace。ページは「who、can」の 1 文で描く',
  inputSchema: object({
    changes: {
      type: 'array',
      items: { type: 'object', oneOf: [op('add', { to: requirement }), op('replace', { which, to: requirement }), op('remove', { which })] },
    },
  }, ['changes']),
  isDeferred: false,
}

// 今の要求リストに変更を当てて、読んだ版に固定して書き直す。1 件でも問題があれば何も書かない
const run = async (engine: Engine, input: unknown) => JsonSchema.check<{ changes: RequirementChange[] }>(spec.inputSchema, input).either(
  ({ changes }) => FleetDb.revise(engine, FleetDb.paths().requirements, doc =>
    Requirements.revise((doc as RequirementsDoc | undefined)?.requirements ?? [], changes).and(requirements => ({ requirements })), 'RequirementsRevised'),
  async error => ({ deny: error }))

export const reviseRequirements = { tool: 'mcp__software-fleet__revise_requirements' as const, spec, run } satisfies FleetTool
