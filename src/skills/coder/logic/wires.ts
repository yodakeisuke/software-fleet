import type { ModelFlow, Model } from '../../../types/fleet'

// --- public interface
export const Wires = {
  problems: (model: Model) => problems(model),
  typeOf: (model: Model, label: string) => typeOf(model, label),
}

// --- operations
const problems = (model: Model) => model.flows.flatMap(flow => labels(flow).flatMap(label => unbound(model, flow, label)))

// --- business rules
// 流れの線の名前: 列名・上から入ってくる線・箱が出した線
const labels = (flow: ModelFlow) => [...flow.columns.map(column => column.name), ...Object.values(flow.start), ...flow.steps.flatMap(step => Object.values(step.out ?? {}).map(wire => wire.name))]
// 線の名前は「…型名〈状態｜状態〉 ✓ ×N」。〈〉で状態を言う線は、型名が構造の型に結ばれ、状態はその型の箱の名前
const unbound = (model: Model, flow: ModelFlow, label: string) => {
  const states = statesOf(label)
  const type = typeOf(model, label)
  if (states.length === 0) return []
  if (type === undefined) return [`流れ「${flow.name}」の線「${label}」が型に結べない（〈 の前の末尾を型の名前にする）`]
  return states.filter(state => !(type.objects ?? []).some(object => object.name === state)).map(state => `流れ「${flow.name}」の線「${label}」の状態「${state}」が型「${type.name}」の箱にない`)
}
// 型名は 〈 の前から ✓ と ×N を除いた末尾に、最長一致（地図と同じ結び方）
const typeOf = (model: Model, label: string) => {
  const base = label.split('〈')[0]?.replace(/\s*✓\s*$/, '').replace(/\s*×N.*$/, '').trim() ?? ''
  return [...model.types].sort((a, b) => b.name.length - a.name.length).find(type => base === type.name || base.endsWith(type.name))
}
// 〈〉の中の状態（｜区切り）
const statesOf = (label: string) => /〈([^〉]*)〉/.exec(label)?.[1]?.split('｜').map(state => state.trim()) ?? []
