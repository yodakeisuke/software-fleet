import type { Model, ModelType } from '../../../types/fleet'
import { References } from './references'

// --- public interface
export const Placement = {
  problems: (model: Model) => problems(model),
}

// --- operations
const problems = (model: Model) => model.types.flatMap(placed)

// --- business rules
// 箱の位置（at）は型の箱の全部に付けるか全部省き（一部だけだと、省いた箱が置いた箱に重なって描かれる）、[列, 行] の 0 以上の整数で、重ならない
const placed = (type: ModelType) => {
  const objects = type.objects ?? []
  const given = objects.filter(object => object.at !== undefined)
  return [
    ...(given.length === 0 || given.length === objects.length ? [] : [`型「${type.name}」の at は箱の全部に付けるか全部省く`]),
    ...given.filter(object => !isCell(object.at)).map(object => `型「${type.name}」の「${object.name}」の at は [列, 行] の 0 以上の整数`),
    ...References.duplicated(given.map(object => JSON.stringify(object.at)), `型「${type.name}」の at`),
  ]
}
// [列, 行] の 0 以上の整数 2 つ
const isCell = (at: number[] | undefined) => at?.length === 2 && at.every(n => Number.isInteger(n) && n >= 0)
