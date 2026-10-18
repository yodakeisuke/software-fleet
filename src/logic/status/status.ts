import type { JsonSchema, Status as StatusDoc } from '../../engine-protocol'
import { Schema } from '../schema/schema'
import { Ship } from '../ship/ship'

// --- public interface
export const Status = {
  schema: () => request(),
  of: (input: unknown) => of(input),
}

// --- operations
const of = (input: unknown) => Schema.check<{ status: StatusDoc }>(request(), input).and(pick)

// --- business rules
// tool の入力は { status }（入力の一番外側には oneOf を置けないので包む）
const request = (): JsonSchema => ({ type: 'object', required: ['status'], properties: { status: schema() } })
// ship の今。作業中・収束・詰まり・待機のどれか
const schema = (): JsonSchema => ({
  type: 'object',
  oneOf: [
    state('working', { doing: text('今していること。1 行') }),
    state('converged', {}),
    state('stuck', { reason: text('なぜ進めないか。1 行') }),
    state('waiting', { on: { type: 'string', enum: [...Ship.names(), 'user'], description: '誰を待っているか' }, what: text('何を待っているか。1 行') }),
  ],
})
// state の値で分かれる形の 1 つ
const state = (name: string, fields: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  required: ['state', ...Object.keys(fields)],
  properties: { state: { type: 'string', enum: [name] }, ...fields },
})
// 空でない 1 行
const text = (description: string): JsonSchema => ({ type: 'string', minLength: 1, description })
// 入力から Status の項目だけを取り出す（tool の呼び出しの付帯情報は持ち込まない）
const pick = ({ status }: { status: StatusDoc }) => Object.fromEntries(Object.entries(status).filter(([key]) => ['state', 'doing', 'reason', 'on', 'what'].includes(key))) as StatusDoc
