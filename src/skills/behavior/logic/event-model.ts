import type { Behavior, BehaviorChanges } from '../../../types/fleet'
import { Result } from '../../../fleet/logic/result'
import { Gwt } from './gwt'
import { References } from './references'
import { Revision } from './revision'
import { Timeline } from './timeline'

// --- public interface
export const EventModel = {
  revise: (current: Behavior, changes: BehaviorChanges) => revise(current, changes),
  empty: () => empty(),
  changed: (changes: BehaviorChanges) => changed(changes),
}

// --- operations
const revise = (current: Behavior, changes: BehaviorChanges) => verdict(Revision.apply(current, changes), current)

// --- business rules
// まだ何もない盤面
const empty = (): Behavior => ({ moments: [], views: [], readModels: [], flows: [], hotspots: [] })
// 問題が 1 つでもあれば何も変えずに、全部を 1 つの文にして失敗にする
const verdict = (draft: { model: Behavior; missing: string[] }, before: Behavior) =>
  Result.checked(draft.model, [...missing(draft.missing, before), ...Timeline.problems(draft.model), ...References.problems(draft.model), ...Gwt.problems(draft.model)])
// 指したものがない。今の盤面を忘れた LLM が呼び直せるよう、今ある鍵を全部挙げる
const missing = (pointed: string[], before: Behavior) => (pointed.length === 0 ? [] : [`見つからない: ${pointed.join('、')}。今あるもの: ${keys(before)}`])
// 今ある鍵。時点はコマンド名、画面は画面の名前、問いは問いの文
const keys = (model: Behavior) => ([
  ['時点', Timeline.moments(model).map(moment => moment.command.name)], ['画面', model.views.map(view => view.screen)],
  ['リードモデル', model.readModels.map(readModel => readModel.name)], ['流れ', model.flows.map(flow => flow.name)], ['問い', model.hotspots.map(hotspot => hotspot.question)],
] as const).map(([what, names]) => `${what} ${quoted(names)}`).join(' / ')
// 名前を「」でくくって並べる。なければ「なし」
const quoted = (names: string[]) => (names.length === 0 ? 'なし' : names.map(name => `「${name}」`).join(''))
// 変更の記録に残す、何をいくつ変えたか（+ 足す・~ 直す・- 消す）
const changed = (changes: BehaviorChanges) => ([
  ['時点', changes.moments], ['画面', changes.views], ['リードモデル', changes.readModels], ['流れ', changes.flows], ['問い', changes.hotspots],
] as const).flatMap(([what, list]) => (list?.length ? [`${what} ${counted(list)}`] : [])).concat(changes.identity ? ['名乗り'] : []).join(' / ')
// 足す・直す・消すの件数
const counted = (list: readonly { op: string }[]) => (['add', 'replace', 'remove'] as const).map((op, k) => `${'+~-'[k]}${list.filter(change => change.op === op).length}`).join(' ')
