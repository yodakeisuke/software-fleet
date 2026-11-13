import type { ModelFlow, Model, Step } from '../../../types/fleet'

// --- public interface
export const Flows = {
  problems: (model: Model) => problems(model),
}

// --- operations
const problems = (model: Model) => model.flows.flatMap(flow => [...started(flow), ...flow.steps.flatMap(step => stepped(model, flow, step))])

// --- business rules
// 上から入ってくる線（start）の列は、流れの列の範囲
const started = (flow: ModelFlow) => Object.keys(flow.start).filter(key => !within(flow, columnOf(key))).map(key => `流れ「${flow.name}」の start の列 ${key} がない${range(flow)}`)
// 段の処理は logic にあり、span・out・drop の列は流れの列の範囲
const stepped = (model: Model, flow: ModelFlow, step: Step) => [
  ...(model.logic.some(logic => logic.id === step.logic) ? [] : [`流れ「${flow.name}」の段の処理「${step.logic}」が logic にない`]),
  ...spanned(flow, step),
  ...[...Object.keys(step.out ?? {}), ...(step.drop ?? []).map(String)].filter(key => !within(flow, columnOf(key))).map(key => `流れ「${flow.name}」の段「${step.logic}」の列 ${key} がない${range(flow)}`),
]
// span は [左の列, 右の列] の 2 つで、左 ≤ 右
const spanned = (flow: ModelFlow, step: Step) => (ordered(flow, step.span) ? [] : [`流れ「${flow.name}」の段「${step.logic}」の span は [左, 右] の列${range(flow)}`])
// 2 つの列が範囲の中で、左 ≤ 右
const ordered = (flow: ModelFlow, span: number[]) => span.length === 2 && span.every(column => within(flow, column)) && span[0] === Math.min(...span)
// 列の鍵は 0・1・2 … の表記だけ（ページは鍵のまま列を引くので、01・1.0・空は列にならない）
const columnOf = (key: string) => (/^(0|[1-9]\d*)$/.test(key) ? Number(key) : NaN)
// 列の番号は 0 以上、列数未満の整数
const within = (flow: ModelFlow, column: number) => Number.isInteger(column) && column >= 0 && column < flow.columns.length
// 選べる列の範囲
const range = (flow: ModelFlow) => `（列は 0〜${flow.columns.length - 1}）`
