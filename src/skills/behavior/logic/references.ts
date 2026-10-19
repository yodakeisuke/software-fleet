import type { Behavior, Flow, Hotspot, ReadModel, View } from '../../../types/fleet'
import { Timeline } from './timeline'

// --- public interface
export const References = {
  problems: (model: Behavior) => problems(model),
}

// --- operations
const problems = (model: Behavior) => [
  ...Timeline.duplicated(model.readModels.map(readModel => readModel.name), 'リードモデル'),
  ...Timeline.duplicated(model.views.map(view => view.screen), '画面'),
  ...Timeline.duplicated(model.flows.map(flow => flow.name), '流れ'),
  ...Timeline.duplicated(model.hotspots.map(hotspot => hotspot.question), '問い'),
  ...Timeline.moments(model).flatMap(moment => unread(model, moment.reads, `「${moment.command.name}」`)),
  ...model.views.flatMap(view => [...unread(model, view.reads, `画面「${view.screen}」`), ...unplaced(model, view)]),
  ...model.readModels.flatMap(readModel => unsourced(model, readModel)),
  ...model.flows.flatMap(flow => unbranched(model, flow)),
  ...model.hotspots.flatMap(hotspot => unanchored(model, hotspot)),
]

// --- business rules
// 読むリードモデルは盤面にある
const unread = (model: Behavior, reads: string[], reader: string) =>
  reads.filter(name => !model.readModels.some(readModel => readModel.name === name)).map(name => `${reader}が読む「${name}」がリードモデルにない`)
// 読むだけの画面は、どこかの軸の時点（コマンド名）で見る
const unplaced = (model: Behavior, view: View) =>
  (Timeline.moments(model).some(moment => moment.command.name === view.at) ? [] : [`画面「${view.screen}」を見る時点「${view.at}」がない`])
// リードモデルの出どころは軸の事実（いつ起きたかは問わない。読む時点より後の事実も、ほかの回の履歴として読める）
const unsourced = (model: Behavior, readModel: ReadModel) =>
  readModel.sources.filter(source => Timeline.located(model, source) === undefined).map(source => `「${readModel.name}」の出どころ「${source}」が軸の事実にない`)
// 別の流れは、本流のコマンドから分かれる
const unbranched = (model: Behavior, flow: Flow) =>
  (model.moments.some(moment => moment.command.name === flow.from) ? [] : [`流れ「${flow.name}」の分かれ元「${flow.from}」が本流のコマンドにない`])
// 未決定の問いが関わる事実は、軸の事実（関わる事実がない問いもある）
const unanchored = (model: Behavior, hotspot: Hotspot) =>
  (hotspot.at === undefined || Timeline.located(model, hotspot.at) !== undefined ? [] : [`問い「${hotspot.question}」が関わる「${hotspot.at}」が軸の事実にない`])
