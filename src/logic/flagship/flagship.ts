import type { Decision, Fleet, JsonSchema } from '../../engine-protocol'
import { Schema } from '../schema/schema'

// --- public interface
export const Flagship = {
  briefSchema: () => briefSchema(),
  brief: (input: unknown) => brief(input),
  decisionSchema: () => decisionSchema(),
  decision: (input: unknown) => decision(input),
  decisionId: (now: number) => decisionId(now),
}

// --- operations
const brief = (input: unknown) => Schema.check<Fleet>(briefSchema(), input).and(pickBrief)
const decision = (input: unknown) => Schema.check<Decision>(decisionSchema(), input).and(pickDecision)

// --- business rules
// 依頼の要約。ダッシュボードの一番上に出る
const briefSchema = (): JsonSchema => ({
  type: 'object',
  required: ['brief'],
  properties: { brief: { type: 'string', minLength: 1, description: '何を誰のために作るか。1〜2 行' } },
})
// flagship が決めたこと。ユーザの判断を受けて決めたなら、その判断の id を closes に
const decisionSchema = (): JsonSchema => ({
  type: 'object',
  required: ['what', 'why'],
  properties: {
    what: { type: 'string', minLength: 1, description: '決めたこと。1 行' },
    why: { type: 'string', minLength: 1, description: 'なぜ。1 行' },
    closes: { type: 'string', minLength: 1, description: 'この決定で閉じる判断の id（ask_user が返したもの）' },
  },
})
// 入力から Fleet の項目だけを取り出す
const pickBrief = ({ brief }: Fleet): Fleet => ({ brief })
// 入力から Decision の項目だけを取り出す
const pickDecision = ({ what, why, closes }: Decision): Decision => ({ what, why, closes })
// 決定の id は、記録した時刻から作る
const decisionId = (now: number) => `decision-${now}`
