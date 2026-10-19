import type { Behavior, CommandTest, DomainEvent, Moment, Occurrence, ReadModel, ReadTest, Values } from '../../../types/fleet'
import { Timeline } from './timeline'

// --- public interface
export const Gwt = {
  problems: (model: Behavior) => problems(model),
}

// --- operations
const problems = (model: Behavior) => [
  ...Timeline.moments(model).flatMap(moment => [
    ...duplicated(moment.command.name, moment.tests), ...uncovered(moment), ...moment.tests.flatMap(test => commandTest(model, moment, test)),
  ]),
  ...model.readModels.flatMap(readModel => [
    ...duplicated(readModel.name, readModel.tests), ...untested(readModel), ...readModel.tests.flatMap(test => readTest(model, readModel, test)),
  ]),
]

// --- business rules
// 例の名前は他の例と違う点なので、同じコマンド（リードモデル）の中で 1 つだけ
const duplicated = (owner: string, tests: { name: string }[]) =>
  tests.filter((test, at) => tests.findIndex(other => other.name === test.name) !== at).map(test => `「${owner}」の例「${test.name}」が重なっている`)
// 新・改の時点では、起きる事実と別の結果のどれにも、それを起こす例がある（既存は文脈なので要らない）
const uncovered = (moment: Moment) => (moment.change === '既' ? [] : Timeline.outcomes(moment)
  .filter(outcome => !moment.tests.some(test => results(test).some(result => result.event === outcome.name)))
  .map(outcome => `「${moment.command.name}」に「${outcome.name}」を起こす例がない`))
// 新・改のリードモデルには例が 1 件以上ある
const untested = (readModel: ReadModel) => (readModel.change === '既' || readModel.tests.length > 0 ? [] : [`「${readModel.name}」に例がない`])
// 例の結果に出る事実。拒否なら何も起きない
const results = (test: CommandTest) => (test.expect === 'error' ? [] : test.expect)
// コマンドの例。前提は軸の事実、操作の鍵はコマンドの入力か「時刻」、結果はその時点で起きうる事実
const commandTest = (model: Behavior, moment: Moment, test: CommandTest) => [
  ...test.given.flatMap(given => occurred(model, unbound(model, given))),
  ...unknown(test.when, [...moment.command.params, '時刻']).map(key => `操作の「${key}」はコマンドの入力にない（入力: ${listed(moment.command.params)}）`),
  ...results(test).flatMap(result => outcome(moment, unbound(model, result))),
].map(problem => `「${moment.command.name}」の例「${test.name}」: ${problem}`)
// リードモデルの例。前提は軸の事実、見える行の鍵はリードモデルの項目
const readTest = (model: Behavior, readModel: ReadModel, test: ReadTest) => [
  ...test.given.flatMap(given => occurred(model, unbound(model, given))),
  ...[...new Set(test.rows.flatMap(row => unknown(row, readModel.fields)))].map(key => `見える行の「${key}」は項目にない（項目: ${listed(readModel.fields)}）`),
].map(problem => `「${readModel.name}」の例「${test.name}」: ${problem}`)
// 前提は軸の事実で、値の鍵はその事実の属性。例は閉じた世界なので、軸のどこで起きる事実でも前提にできる（ほかの回の履歴）
const occurred = (model: Behavior, given: Occurrence) => {
  const found = Timeline.located(model, given.event)
  return found === undefined ? [`前提の「${given.event}」は軸の事実にない`] : outside('前提', given, found)
}
// 結果の事実はその時点で起きうるもので、値の鍵はその事実の属性
const outcome = (moment: Moment, result: Occurrence) => {
  const event = Timeline.outcomes(moment).find(outcome => outcome.name === result.event)
  return event === undefined ? [`結果の「${result.event}」はこの時点で起きうる事実にない`] : outside('結果', result, event)
}
// 名乗りの鍵は軸のどの事実も束ねるので、どの事実の値にも書ける
const unbound = (model: Behavior, occurrence: Occurrence) => ({ ...occurrence, values: Object.fromEntries(Object.entries(occurrence.values).filter(([key]) => key !== model.identity?.key)) })
// 値の鍵は、その事実の属性
const outside = (role: string, occurrence: Occurrence, event: DomainEvent) =>
  unknown(occurrence.values, event.attrs).map(key => `${role}の「${occurrence.event}」の「${key}」は属性にない（属性: ${listed(event.attrs)}）`)
// 盤面の語にない鍵
const unknown = (values: Values, words: string[]) => Object.keys(values).filter(key => !words.includes(key))
// 語を・でつなぐ。なければ「なし」
const listed = (words: string[]) => (words.length === 0 ? 'なし' : words.join('・'))
