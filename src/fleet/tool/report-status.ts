import type { Engine, FleetTool, JsonSchemaNode, Review as ReviewDoc, ShipName, Status } from '../../types/fleet'
import { FleetDb } from '../fleet-db'
import { JsonSchema } from '../json-schema'
import { Boarding } from '../logic/boarding'
import { Review } from '../logic/review'

const { text, object } = JsonSchema
// state の値で分かれる形の 1 つ
const state = (name: string, fields: Record<string, JsonSchemaNode>) => object({ state: { type: 'string', enum: [name] }, ...fields }, ['state', ...Object.keys(fields)])

// ship の今。全 ship が使う
const spec = {
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
        state('waiting', { on: { type: 'string', enum: [...Boarding.ships(), 'user'], description: '誰を待っているか' }, what: text('何を待っているか。1 行') }),
      ],
    },
  }, ['status']),
  isDeferred: false,
}

// tool の呼び出しの付帯情報を持ち込まないよう、Status の項目だけを残す
const pick = (status: Status) => Object.fromEntries(Object.entries(status).filter(([key]) => ['state', 'doing', 'reason', 'on', 'what'].includes(key))) as Status

// 収束してレビュー待ちになったら、そう返す
const run = async (engine: Engine, input: unknown) => {
  const session = await engine.fleet()
  const ship = Boarding.ships().find(name => name === session?.role)
  if (ship === undefined) return { deny: 'このセッションは fleet の ship として乗っていない' }
  const now = new Date(await engine.now()).toISOString()
  const where = FleetDb.paths()
  return JsonSchema.check<{ status: Status }>(spec.inputSchema, input).either(async ({ status }) => {
    const doc = Review.since(pick(status), now)
    const wrote = await FleetDb.put(engine, `${where.ships}/${ship}`, doc, 'StatusReported')
    const review = (await FleetDb.read(engine, `${where.reviews}/${ship}`)) as ReviewDoc | undefined
    return 'result' in wrote && Review.awaiting(ship as ShipName, doc, review) ? { result: 'StatusReported, awaiting review' } : wrote
  }, async error => ({ deny: error }))
}

export const reportStatus = { tool: 'mcp__software-fleet__report_status' as const, spec, run } satisfies FleetTool
