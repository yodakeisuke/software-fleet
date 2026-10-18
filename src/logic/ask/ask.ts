import type { Ask as AskDoc, Result as Data } from '../../engine-protocol'
import { Result } from '../primitive/result'
import { Schema } from '../schema/schema'
import { AskRequest } from './ask-request'

// --- public interface
export const Ask = {
  schema: () => schema(),
  of: (input: unknown) => of(input),
  id: (now: number) => id(now),
}

// --- operations
const schema = () => AskRequest.schema()
const of = (input: unknown) => Schema.check<AskDoc>(AskRequest.schema(), input).and(pick).and(rules)

// --- business rules
// 入力から Ask の項目だけを取り出す（tool の呼び出しの付帯情報は持ち込まない）
const pick = ({ question, background, options, recommended, evaluation }: AskDoc): AskDoc => ({ question, background, options, recommended, evaluation })
// 選択肢の id は重ならず、推奨はそのどれかで、評価表は選択肢×評価軸の形
const rules = (ask: AskDoc) => {
  const found = [...duplicated(ask), ...unknownRecommended(ask), ...misshapen(ask)]
  return Result.given<Data<AskDoc, string>>(found.length === 0 ? { ok: true, value: ask } : { ok: false, error: found.join(' / ') })
}
// 選択肢の id が重なっている
const duplicated = (ask: AskDoc) => (new Set(ask.options.map(o => o.id)).size === ask.options.length ? [] : ['options の id が重なっている'])
// 推奨が選択肢のどれでもない
const unknownRecommended = (ask: AskDoc) => (ask.options.some(o => o.id === ask.recommended) ? [] : [`recommended（${ask.recommended}）が options の id のどれでもない`])
// 評価表の行が選択肢の数と、各行のマスが評価軸の数と合っていない
const misshapen = (ask: AskDoc) => {
  const table = ask.evaluation
  const fits = !table || (table.cells.length === ask.options.length && table.cells.every(row => row.length === table.axes.length))
  return fits ? [] : ['evaluation.cells は options と同じ行数で、各行は axes と同じ数']
}
// 判断の id は、出した時刻から作る
const id = (now: number) => `ask-${now}`
