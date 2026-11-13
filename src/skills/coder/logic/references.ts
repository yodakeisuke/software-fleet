import type { Holds, Mapping, Model, ModelObject, ModelType, Morphism } from '../../../types/fleet'

// --- public interface
export const References = {
  problems: (model: Model) => problems(model),
  duplicated: (keys: string[], what: string) => duplicated(keys, what),
}

// --- operations
const problems = (model: Model) => [
  ...duplicated(model.types.map(type => type.id), '型の id'),
  ...duplicated(model.types.map(type => type.name), '型の名前'),
  ...duplicated(model.logic.map(logic => logic.id), '処理の id'),
  ...duplicated(model.flows.map(flow => flow.id), '流れの id'),
  ...model.types.flatMap(type => formed(model, type)),
  ...model.maps.flatMap(map => unmapped(model, map)),
]

// --- business rules
// 表は列で、他の形は中の箱で見る
const formed = (model: Model, type: ModelType) => (type.form === 'table' ? tabled(model, type) : boxed(model, type))
// 指す鍵は重ならない（型・処理・流れ・箱は id で、表の列は名前で指し、流れの線は型の名前で型に結ばれる）
const duplicated = (keys: string[], what: string) => [...new Set(keys.filter((key, at) => keys.indexOf(key) !== at))].map(key => `${what}「${key}」が重なっている`)
// 表は列を 1 つ以上持ち、列の名前は 1 つだけ、fk の先は表
const tabled = (model: Model, type: ModelType) => {
  const columns = type.columns ?? []
  return [
    ...(columns.length === 0 ? [`表「${type.name}」に columns がない`] : []),
    ...duplicated(columns.map(column => column.name), `表「${type.name}」の列`),
    ...columns.flatMap(column => (column.fk === undefined || typeOf(model, column.fk)?.form === 'table' ? [] : [`表「${type.name}」の列 ${column.name} の fk「${column.fk}」が表にない`])),
  ]
}
// 表以外は中の箱（状態・値・選択肢）を 1 つ以上持ち、id は型の中で 1 つだけ。部品の型と、遷移の両端・条件の参照先がある
const boxed = (model: Model, type: ModelType) => {
  const objects = type.objects ?? []
  return [
    ...(objects.length === 0 ? [`型「${type.name}」に objects がない`] : []),
    ...duplicated(objects.map(object => object.id), `型「${type.name}」の箱の id`),
    ...objects.flatMap(object => parts(model, type, object)),
    ...(type.morphisms ?? []).flatMap(morphism => ends(model, type, morphism)),
  ]
}
// 部品（holds.parts）が指す型がある
const parts = (model: Model, type: ModelType, object: ModelObject) =>
  partsOf(object.holds).filter(part => typeOf(model, part.type) === undefined).map(part => `型「${type.name}」の「${object.name}」の部品が指す型「${part.type}」がない`)
// 遷移の両端はその型の箱の id。条件（when）の型と、その型の箱もある
const ends = (model: Model, type: ModelType, morphism: Morphism) => [
  ...[morphism.from, morphism.to].filter(id => !has(type, id)).map(id => `型「${type.name}」の遷移「${morphism.by}」の端「${id}」が箱にない`),
  ...conditioned(model, type, morphism),
]
// 条件（when）があれば、その型があり、その状態（at）がその型の箱にある
const conditioned = (model: Model, type: ModelType, { by, when }: Morphism) => {
  if (when === undefined) return []
  const target = typeOf(model, when.type)
  if (target === undefined) return [`型「${type.name}」の遷移「${by}」の条件の型「${when.type}」がない`]
  return has(target, when.at) ? [] : [`型「${type.name}」の遷移「${by}」の条件の状態「${when.at}」が型「${target.name}」の箱にない`]
}
// 対応（maps）の両端の型がある
const unmapped = (model: Model, map: Mapping) => [map.from, map.to].filter(id => typeOf(model, id) === undefined).map(id => `対応 ${map.from} → ${map.to} の「${id}」が型にない`)
// 中身の部品。unit（省略を含む）と prim は部品を持たない
const partsOf = (holds: Holds | undefined) => (typeof holds === 'object' && 'parts' in holds ? holds.parts : [])
// id の型（なければ undefined）
const typeOf = (model: Model, id: string) => model.types.find(type => type.id === id)
// その型に id の箱があるか
const has = (type: ModelType, id: string) => (type.objects ?? []).some(object => object.id === id)
