import type { Behavior, Engine, FleetTool, Quality as QualityDoc, QualityInput, Requirements } from '../../../types/fleet'
import { Boarding } from '../../../fleet/logic/boarding'
import { FleetDb } from '../../../fleet/db/fleet-db'
import { JsonSchema } from '../../../fleet/schema/json-schema'
import { Quality } from '../logic/quality'

const { text, object, choice, list } = JsonSchema
const shots = list(text(), '証跡の画像。Artifact の asset: true で fleet の artifact に上げた url')
const check = object({
  ship: choice(['requirement', 'behavior'], 'ケースを持つ ship'),
  of: text('requirement は要求の「who、can」の 1 文、behavior はコマンドかリードモデルの名前'),
  name: text('requirement はテストの act、behavior は例の名前'),
  outcome: choice(['合格', '不合格', '実行できない']),
  saw: text('実際に操作して見たこと'),
  shots,
}, ['ship', 'of', 'name', 'outcome', 'saw'])
const finding = object({
  title: text('鍵'),
  kind: choice(['バグ', '曖昧な仕様']),
  detail: text('再現の手順と、期待と実際（曖昧な仕様なら、どこがどう決まっていないか）'),
  to: choice(Boarding.ships(), '直す（決める）ship'),
  state: choice(['未解決', '片づいた']),
  shots,
}, ['title', 'kind', 'detail', 'to', 'state'])

// QA の結果。ユーザはこれを品質ダッシュボードとしてスマホで読み、QA が十分かを判断する
const spec = {
  name: 'revise_quality',
  description: 'QA の結果を品質ダッシュボードに出す。渡した分だけ、鍵（ケース・title・aim）で上書きする。verdict は丸ごと置き換え、「可」は今あるケースが全部合格で未解決の発見がないときだけ',
  inputSchema: object({
    verdict: object({ merge: choice(['可', '条件つき', '不可'], 'マージしてよいか'), why: text('根拠。残るリスクがあれば書く') }, ['merge', 'why']),
    checks: list(check, 'ケースを実行した結果'),
    findings: list(finding, '見つけたバグと曖昧な仕様'),
    charters: list(object({ aim: text('鍵'), learned: text() }, ['aim', 'learned']), '探索の狙いと分かったこと'),
  }, []),
  isDeferred: false,
}

// 今あるケースを requirement と behavior の成果物から集め、今の結果に当てて、読んだ版に固定して書き直す。1 件でも問題があれば何も書かない
const run = async (engine: Engine, input: unknown) => JsonSchema.check<QualityInput>(spec.inputSchema, input).either(async given => {
  const where = FleetDb.paths()
  const [requirements, behavior] = await Promise.all([FleetDb.read(engine, where.requirements), FleetDb.read(engine, where.behavior)])
  const cases = Quality.cases((requirements as Requirements | undefined)?.requirements ?? [], behavior as Behavior | undefined)
  const now = new Date(await engine.now()).toISOString()
  return FleetDb.revise(engine, where.quality, doc =>
    Quality.revise({ checks: [], findings: [], charters: [], ...(doc as QualityDoc | undefined) }, given, { cases, now }), 'QualityRevised')
}, async error => ({ deny: error }))

export const reviseQuality = { tool: 'mcp__software-fleet__revise_quality' as const, spec, run } satisfies FleetTool
