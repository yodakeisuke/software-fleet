import type { Behavior, DomainEvent, Moment, Trigger } from '../../../types/fleet'

// --- public interface
export const Timeline = {
  problems: (model: Behavior) => problems(model),
  moments: (model: Behavior) => moments(model),
  outcomes: (moment: Moment) => outcomes(moment),
  located: (model: Behavior, event: string) => located(model, event),
  duplicated: (names: string[], what: string) => duplicated(names, what),
}

// --- operations
const problems = (model: Behavior) => [
  ...duplicated(moments(model).map(moment => moment.command.name), 'コマンド'),
  ...axes(model).flatMap(axis => duplicated(axis.flatMap(outcomes).map(event => event.name), '同じ軸の事実')),
  ...unlike(moments(model).flatMap(outcomes)),
  ...moments(model).flatMap(eventless),
  ...timelines(model).flatMap(({ before, axis }) => axis.flatMap((moment, at) => deaf([...before, ...axis.slice(0, at)], moment))),
]

// --- business rules
// 軸は本流と、別の流れ
const axes = (model: Behavior) => [model.moments, ...model.flows.map(flow => flow.moments)]
// 流れは、分かれ元までの本流の続き。時間の前後は、本流と、その続きの中で決まる
const timelines = (model: Behavior) => [{ before: [], axis: model.moments }, ...model.flows.map(flow => ({ before: branched(model.moments, flow.from), axis: flow.moments }))]
// 分かれ元の時点までの本流。分かれ元が本流になければ本流の全部（分かれ元の誤りは References が挙げるので、それに引きずられた聴く事実の誤りを重ねて挙げない）
const branched = (main: Moment[], from: string) => {
  const at = main.findIndex(moment => moment.command.name === from)
  return at < 0 ? main : main.slice(0, at + 1)
}
// どの軸の時点も
const moments = (model: Behavior) => axes(model).flat()
// 時点で起きうる事実は、起きる事実と、起きえた別の結果
const outcomes = (moment: Moment) => [...moment.events, ...moment.otherwise]
// 名前の事実（どの軸にもなければ undefined）
const located = (model: Behavior, event: string) => moments(model).flatMap(outcomes).find(outcome => outcome.name === event)
// 時点・リードモデル・画面・流れ・問いは名前で指すので、同じ名前はそれぞれ 1 つだけ（軸をまたいでも）。盤面は軸ごとに事実を名前で置くので、事実は同じ軸の中で 1 つだけ
const duplicated = (names: string[], what: string) => [...new Set(names.filter((name, at) => names.indexOf(name) !== at))].map(name => `${what}「${name}」が重なっている`)
// 軸をまたいで同じ名前の事実は同じ事実で、同じ属性を運ぶ（流れの中でまた起きてよい）
const unlike = (events: DomainEvent[]) => [...new Set(events.filter(event => events.some(other => other.name === event.name && carried(other) !== carried(event))).map(event => event.name))]
  .map(name => `事実「${name}」が、時点によって違う属性を運んでいる`)
// 事実が運ぶ属性（並びは問わない）
const carried = (event: DomainEvent) => [...event.attrs].sort().join('、')
// コマンドは事実を 1 つ以上起こす
const eventless = (moment: Moment) => (moment.events.length === 0 ? [`「${moment.command.name}」が起こす事実がない`] : [])
// 規則と、事実に起こされる agent が聴く事実は、それより前の時点で起きる
const deaf = (earlier: Moment[], moment: Moment) => {
  const on = heard(moment.by)
  return on === undefined || earlier.some(before => outcomes(before).some(outcome => outcome.name === on)) ? [] : [`「${moment.command.name}」が聴く「${on}」は、それより前の時点の事実ではない`]
}
// 聴く事実。画面と、人が頼む agent にはない
const heard = (by: Trigger) => (by.kind === 'screen' ? undefined : by.on)
