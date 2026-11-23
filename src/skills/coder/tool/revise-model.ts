import type { Engine, FleetTool, JsonSchemaNode, Model, ModelDoc, ModelInput } from '../../../types/fleet'
import { FleetDb } from '../../../fleet/db/fleet-db'
import { JsonSchema } from '../../../fleet/schema/json-schema'
import { Result } from '../../../fleet/logic/result'
import { CodeModel } from '../logic/code-model'
import { Pointers } from '../logic/pointers'

const { text, object, choice, list } = JsonSchema
const number: JsonSchemaNode = { type: 'number' }
const flag = (description: string): JsonSchemaNode => ({ type: 'boolean', description })
const keyed = (items: JsonSchemaNode, description: string): JsonSchemaNode => ({ type: 'object', description, additionalProperties: items })
// 地図が導けるもの（最上位 = 部品になっていない型、API と保存の直結 = 両端の世界、箱の並び）は書かせない。持つだけで食い違いの種になる
// 同じ定義は $defs に 1 度だけ書き、$ref で指す（LLM が読む tool の説明を短く保つ）
const ref = (name: 'change' | 'holds' | 'object' | 'morphism' | 'column' | 'type' | 'map' | 'logic' | 'wire' | 'step' | 'flow') => JsonSchema.ref(name)
const change = choice(['新', '改', '削'], '今回の変更。git の差分で決め、中身や通る処理が変わった既存は 改。無印は今回触っていない既存（文脈として描く）')
const part = object({ type: text('部品の型の id'), as: text('この型の中での呼び名。型名と同じなら省く') }, ['type'])
const holds: JsonSchemaNode = {
  description: '箱の中身。省けば unit。unit = 中身なし、prim = 素の値、parts = 部品の直積。invariant は常に守る不変条件（形で封じきれないもの）',
  oneOf: [choice(['unit']), object({ prim: text('素の値の説明（例: UUID、整数 ≥ 1）'), invariant: text() }, ['prim']), object({ parts: list(part), invariant: text() }, ['parts'])],
}
const modelObject = object({ id: text('型の中の鍵'), name: text(), at: list(number, 'lifecycle で盤面に置く位置 [列, 行]。省くと自動'), holds: ref('holds'), change: ref('change') }, ['id', 'name'], '箱の中の箱: 状態（lifecycle）・値（value / record）・選択肢（kind）')
const morphism = object({ from: text('箱の id'), to: text('箱の id'), by: text('遷移を起こす契機（動詞句）'), auto: flag('命令ではなく、中に持つ型の状態が変わって起きる遷移なら true（例: 全明細が出荷済）。破線で出る'), change: ref('change') }, ['from', 'to', 'by'], '遷移 = 矢。lifecycle だけが持つ')
const column = object({ name: text(), type: text('DB の型'), pk: flag('主キー'), fk: text('参照する表の id'), change: ref('change') }, ['name', 'type'])
const modelType = object({
  id: text('鍵。部品・対応・fk はこれで指す'), name: text('地図に出る名前。流れの線はこの名前で結ばれる'), world: choice(['api', 'domain', 'db']),
  form: choice(['lifecycle', 'value', 'kind', 'record', 'table'], 'lifecycle = 状態機械（Transition）、value = 値（Computation）、kind = 選択肢（Decision）、record = 境界の項目の直積、table = 表'),
  many: text('親の中に N 個あるときの単位語（例: 行）'), doc: text('1 行の意図。箱に重ねるか押すと出る'),
  code: text('コードでこの形を持つ物を「ファイル#名前」で指す（型・クラス・作り手の関数。ファイルはプロジェクトのルートから。例: src/order/state.ts#OrderState）。lifecycle・kind なら、箱の 1 つ 1 つがその変種になっている型。tool がいまのコードのそのファイルに名前が在るかを確かめ、無ければ拒む。指せない形（素の値・列の値・規約で持っているだけ）は省くと破線の枠で出る。新 の型は省けない。table は要らない'),
  objects: list(ref('object'), 'table 以外。lifecycle・kind は取りうる形を並べる（どれか 1 つ）。value・record は 1 つで、項目は holds.parts'), morphisms: list(ref('morphism')), columns: list(ref('column'), 'table のとき。1 つ以上'), change: ref('change'),
}, ['id', 'name', 'world', 'form'])
const map = object({ from: text('型の id'), to: text('型の id') }, ['from', 'to'], '世界をまたぐ対応（API → ドメイン → 保存）')
const logic = object({
  id: text('鍵。流れの段はこれで指す'), name: text(), layer: choice(['domain', 'usecase', 'persistence'], 'domain = I/O を呼ばない関数だけ（種類は出す線の型から導く）。persistence = DB や外部との入出力（読む・書く・送る）を中で呼ぶ関数。判断と書き込みが 1 つの関数なら persistence。usecase = それらを順に呼ぶ手順（入口の handler も）'),
  note: text('層の補足（例: 外部に問う（権限）、版を確かめて書く）'), fails: list(text(), '失敗の出口の名前'), also: list(text(), 'この処理を通る、流れに描いていないユースケースの名前。改・削 の処理には必ず渡す（無ければ []）'), change: ref('change'),
}, ['id', 'name', 'layer'], '処理 = 流れの箱')
const wire = object({ name: text('線の名前。「型名〈状態｜状態〉 ✓ ×N」の形で構造の型と状態に結ばれる（例: 注文〈下書き〉、引当済の明細 ✓、明細 ×N）'), kind: choice(['api', 'stored'], 'API の求めと返事 / 保存されている値。省くと途中の値') }, ['name'])
const step = object({
  logic: text('処理の id'), span: list(number, '箱が跨ぐ列 [左, 右]'), out: keyed(ref('wire'), '列の番号 → 箱が出した線（名前が変わる所だけ。確かめ済みは ✓）'), drop: list(number, '箱で終わる列'), change: ref('change'),
}, ['logic', 'span'], '流れの 1 段 = 箱')
const flow = object({
  id: text('鍵'), name: text('ユースケースの名前。振る舞いの盤面があれば、そのコマンドかリードモデルの名前のまま'), columns: list(ref('wire'), '線。左が API、右が保存'), start: keyed(text(), '列の番号 → 上から入ってくる線の名前'), steps: list(ref('step'), '上から順'),
}, ['id', 'name', 'columns', 'start', 'steps'], 'ユースケース = 流れの 1 列')

// コードの中の設計図。ページが「構造」と「流れ」の 2 つの地図に投影する
const spec = {
  name: 'revise_model',
  description: 'コードの中の設計図（型・世界をまたぐ対応・処理・流れ）を出す。ページが「構造」と「流れ」の 2 つの地図に投影し、ユーザはスマホでそれを見て構造の品質を判断する。渡した集まり（name・worlds・types・maps・logic・flows）はその全体で置き換え、渡さなければ今のまま。呼ぶたびに、全部の型の code をいまのコードと照合する。1 件でも問題があれば何も書かない',
  inputSchema: { ...object({
    name: text('この設計図の名前（例: 注文）'),
    worlds: list(object({ id: choice(['api', 'domain', 'db']), name: text('地図に出る区画の名前（例: 境界 · API、保存 · RDB）') }, ['id', 'name']), '3 つの世界。名前を変えたいときだけ渡す'),
    types: list(ref('type'), '型 = 構造の箱'),
    maps: list(ref('map')),
    logic: list(ref('logic')),
    flows: list(ref('flow')),
  }, []), $defs: { change, holds, object: modelObject, morphism, column, type: modelType, map, logic, wire, step, flow } },
  isDeferred: false,
}

// 形と参照が通った設計図の code を、いまのコードと照合する（実線の箱は、コードに在ると確かめた物だけ）
const linked = async (engine: Engine, model: ModelDoc) => Result.checked(model, Pointers.problems(model, await engine.sources(Pointers.files(model))))

// 今の設計図に渡した集まりを当てて、直した時刻を付け、コードと照合し、読んだ版に固定して書き直す。1 件でも問題があれば何も書かない
const run = async (engine: Engine, input: unknown) => JsonSchema.check<ModelInput>(spec.inputSchema, input).either(async given => {
  const at = new Date(await engine.now()).toISOString()
  return FleetDb.revise(engine, FleetDb.paths().model, async doc => CodeModel.revise({ ...CodeModel.empty(), ...(doc as Partial<Model> | undefined) }, given)
    .either(model => linked(engine, { ...model, at }), async error => Result.fail(error)), 'ModelRevised')
}, async error => ({ deny: error }))

export const reviseModel = { tool: 'mcp__software-fleet__revise_model' as const, spec, run } satisfies FleetTool
