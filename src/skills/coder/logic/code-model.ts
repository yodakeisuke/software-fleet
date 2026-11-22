import type { Model, ModelInput } from '../../../types/fleet'
import { Result } from '../../../fleet/logic/result'
import { Flows } from './flows'
import { Placement } from './placement'
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
const empty = (): Model => ({ name: '', worlds: [{ id: 'api', name: '境界 · API' }, { id: 'domain', name: 'ドメイン' }, { id: 'db', name: '保存 · DB' }], types: [], maps: [], logic: [], flows: [], caveats: [] })
// 渡した集まり（name・worlds・types・maps・logic・flows・caveats）はその全体で置き換え、渡さなければ今のまま
const merged = (current: Model, input: ModelInput): Model => ({ ...current, ...input })
// 問題が 1 つでもあれば何も書かずに、全部を 1 つの文にして失敗にする
const verdict = (model: Model) =>
  Result.checked(model, [...named(model), ...worlds(model), ...shared(model), ...References.problems(model), ...Placement.problems(model), ...Flows.problems(model), ...Wires.problems(model)])
// 設計図には名前がある（最初の呼び出しで name を渡す）
const named = (model: Model) => (model.name === '' ? ['name がない（この設計図の名前。例: 注文）'] : [])
// 意味を変えた既存の処理は、ほかに誰が通るかを言わせる（地図に描いた流れだけでは、変更がどこまで効くか分からない）
const shared = (model: Model) => model.logic.filter(logic => ['改', '削'].includes(logic.change ?? '') && logic.also === undefined)
  .map(logic => `処理「${logic.name}」は ${logic.change} なので also が要る（この処理を通る、流れに描いていないユースケースの名前。無ければ []）`)
// 世界は api・domain・db が 1 つずつ
const worlds = (model: Model) => {
  const ids = model.worlds.map(world => world.id).sort()
  return ids.join(',') === 'api,db,domain' ? [] : ['worlds は api・domain・db の 3 つを 1 つずつ']
}
