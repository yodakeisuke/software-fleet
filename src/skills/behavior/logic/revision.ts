import type { Behavior, BehaviorChanges, FlowChange, Identity, Keyed, Moment, MomentChange } from '../../../types/fleet'

// --- public interface
export const Revision = {
  apply: (current: Behavior, changes: BehaviorChanges): Draft => apply(current, changes),
}

// --- I/O
// 当てた後の盤面と、指したのに見つからなかったもの
type Draft = { model: Behavior; missing: string[] }

// --- operations
const apply = (current: Behavior, changes: BehaviorChanges) =>
  named(listed(timed(flowed({ model: current, missing: [] }, changes), changes), changes), changes.identity)

// --- business rules
// 流れを先に当てる（同じ呼び出しで、足した流れへ時点を入れられるように）
const flowed = (draft: Draft, changes: BehaviorChanges) => (changes.flows ?? []).reduce(onFlow, draft)
// 流れを直すと名前と分岐元が変わり、中の時点は残る。消すと中の時点ごと消える
const onFlow = (draft: Draft, change: FlowChange) => {
  const kept = (name: string) => draft.model.flows.find(flow => flow.name === name)?.moments ?? []
  const to = change.op === 'remove' ? change : { ...change, to: { ...change.to, moments: change.op === 'add' ? [] : kept(change.which) } }
  return keyed(draft, { list: 'flows', what: '流れ', change: to }, flow => flow.name)
}
// 時点を当てる。時点は今のコマンド名で、本流と流れの軸から探す
const timed = (draft: Draft, changes: BehaviorChanges) => (changes.moments ?? []).reduce(onMoment, draft)
// 当てる軸の時点がなければ（足す先の流れがない）、見つからなかったものに残す
const onMoment = (draft: Draft, change: MomentChange) => {
  const axis = axisOf(draft.model, change)
  const moments = momentsOf(draft.model, axis)
  return moments === undefined ? lost(draft, `流れ「${axis}」`) : placed(draft, { axis, moments, change })
}
// 変更が当たる軸（流れの名前。本流は undefined）。足すは flow、直す・消すはそのコマンドが居る軸
const axisOf = (model: Behavior, change: MomentChange) => (change.op === 'add' ? change.flow : model.flows.find(flow => flow.moments.some(m => m.command.name === change.which))?.name)
// 軸の時点。本流は moments、流れはその流れの moments（その流れがなければ undefined）
const momentsOf = (model: Behavior, axis: string | undefined) => (axis === undefined ? model.moments : model.flows.find(flow => flow.name === axis)?.moments)
// 指した時点の位置に当てる。指した時点がなければ見つからなかったものに残す
const placed = (draft: Draft, { axis, moments, change }: { axis: string | undefined; moments: Moment[]; change: MomentChange }) => {
  const pointed = change.op === 'add' ? change.after : change.which
  const at = moments.findIndex(moment => moment.command.name === pointed)
  return pointed !== undefined && at < 0 ? lost(draft, `${searched(axis, change)}時点「${pointed}」`) : withMoments(draft, axis, spliced(moments, at, change))
}
// 足す after は入れる軸の中で探すので、見つからなければその軸を言う（ほかの軸の時点を指す誤りに気づけるように）
const searched = (axis: string | undefined, change: MomentChange) => (change.op !== 'add' ? '' : axis === undefined ? '本流の' : `流れ「${axis}」の`)
// 足すは after の直後（省けば先頭）、直すはその場、消すは取り除く
const spliced = (moments: Moment[], at: number, change: MomentChange) =>
  (change.op === 'add' ? moments.toSpliced(at + 1, 0, change.to) : moments.toSpliced(at, 1, ...(change.op === 'replace' ? [change.to] : [])))
// 軸の時点を差し替える
const withMoments = (draft: Draft, axis: string | undefined, moments: Moment[]) =>
  ({ ...draft, model: axis === undefined ? { ...draft.model, moments } : { ...draft.model, flows: draft.model.flows.map(flow => (flow.name === axis ? { ...flow, moments } : flow)) } })
// 読むだけの画面は画面の名前、リードモデルは名前、未決定の問いは問いの文で指す
const listed = (draft: Draft, changes: BehaviorChanges) => [
  ...(changes.views ?? []).map(change => (d: Draft) => keyed(d, { list: 'views', what: '画面', change }, view => view.screen)),
  ...(changes.readModels ?? []).map(change => (d: Draft) => keyed(d, { list: 'readModels', what: 'リードモデル', change }, readModel => readModel.name)),
  ...(changes.hotspots ?? []).map(change => (d: Draft) => keyed(d, { list: 'hotspots', what: '問い', change }, hotspot => hotspot.question)),
].reduce((d, step) => step(d), draft)
// 名前で指す並びへの 1 つの変更。足すは末尾、直すはその場、消すは取り除く。指したものがなければ何も変えずに残す
const keyed = <K extends 'views' | 'readModels' | 'hotspots' | 'flows'>(draft: Draft, target: { list: K; what: string; change: Keyed<Behavior[K][number]> }, keyOf: (item: Behavior[K][number]) => string) => {
  const { list, what, change } = target
  const items = draft.model[list] as Behavior[K][number][]
  if (change.op === 'add') return { ...draft, model: { ...draft.model, [list]: [...items, change.to] } }
  const at = items.findIndex(item => keyOf(item) === change.which)
  if (at < 0) return lost(draft, `${what}「${change.which}」`)
  return { ...draft, model: { ...draft.model, [list]: items.toSpliced(at, 1, ...(change.op === 'replace' ? [change.to] : [])) } }
}
// 名乗りは、渡したときだけ置き換える
const named = (draft: Draft, identity: Identity | undefined) => (identity === undefined ? draft : { ...draft, model: { ...draft.model, identity } })
// 指したものが見つからない
const lost = (draft: Draft, what: string) => ({ ...draft, missing: [...draft.missing, what] })
