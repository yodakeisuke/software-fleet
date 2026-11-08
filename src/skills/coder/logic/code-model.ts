import type { Model, ModelInput, Result as Data } from '../../../types/fleet'
import { Result } from '../../../fleet/logic/result'
import { Flows } from './flows'
import { References } from './references'
import { Wires } from './wires'

// --- public interface
export const CodeModel = {
  revise: (current: Model, input: ModelInput) => revise(current, input),
  empty: () => empty(),
}

// --- operations
const revise = (current: Model, input: ModelInput) => verdict(merged(current, input))

// --- business rules
// まだ何もない設計図。世界は api（境界）・domain・db（保存）の 3 つ
const empty = (): Model => ({ name: '', worlds: [{ id: 'api', name: '境界 · API' }, { id: 'domain', name: 'ドメイン' }, { id: 'db', name: '保存 · DB' }], types: [], maps: [], logic: [], flows: [] })
// 渡した集まり（name・worlds・types・maps・logic・flows）はその全体で置き換え、渡さなければ今のまま
const merged = (current: Model, input: ModelInput): Model => ({ ...current, ...input })
// 問題が 1 つでもあれば何も書かずに、全部を 1 つの文にして失敗にする
const verdict = (model: Model) => {
  const found = [...named(model), ...worlds(model), ...References.problems(model), ...Flows.problems(model), ...Wires.problems(model)]
  return Result.given<Data<Model, string>>(found.length === 0 ? { ok: true, value: model } : { ok: false, error: found.join(' / ') })
}
// 設計図には名前がある（最初の呼び出しで name を渡す）
const named = (model: Model) => (model.name === '' ? ['name がない（この設計図の名前。例: 注文）'] : [])
// 世界は api・domain・db が 1 つずつ
const worlds = (model: Model) => {
  const ids = model.worlds.map(world => world.id).sort()
  return ids.join(',') === 'api,db,domain' ? [] : ['worlds は api・domain・db の 3 つを 1 つずつ']
}
