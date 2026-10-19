export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

// tool の入力スキーマ（JSON Schema のうち fleet が使う部分）。mod はこれで入力の形も検査する
export type JsonSchemaNode = {
  type?: 'object' | 'array' | 'string'
  description?: string
  properties?: Readonly<Record<string, JsonSchemaNode>>
  required?: readonly string[]
  items?: JsonSchemaNode
  minLength?: number
  enum?: readonly string[]
  oneOf?: readonly JsonSchemaNode[]
  // properties にない項目の形（鍵が自由なオブジェクト）
  additionalProperties?: JsonSchemaNode
  // 同じ定義を何度も書かないよう、一番外側の $defs を $ref で指す
  $ref?: string
  $defs?: Readonly<Record<string, JsonSchemaNode>>
}

// fleet の状態（artifact の DB の文書）。置き場所は fleet/fleet-db.ts、1 文書を書くのは 1 人だけ
export type ShipName = 'requirement' | 'behavior' | 'code-design' | 'implementation' | 'qa' | 'cs' | 'security' | 'ops'
// HTML か SVG の断片。ページがそのまま埋め込む
export type Html = string
export type Explain = { text: string; diagram?: Html }
export type OptionId = string
export type AskId = string
export type Option = { id: OptionId; label: string; consequence: string; detail: Explain }
export type Rating = '◎' | '○' | '△' | '×'
export type Cell = { rating: Rating; note: string }
// cells は [選択肢][評価軸] の順
export type Evaluation = { axes: { name: string; weight: string }[]; cells: Cell[][] }

// flagship が書く（at は mod が付ける）
// 課題と、それをどう解くかの対。requirement のページの先頭に表で出る
export type Problem = { problem: string; solution: string }
export type Fleet = { brief: string; problems?: Problem[] }
export type Ask = { question: string; background: Explain; options: Option[]; recommended: OptionId; evaluation?: Evaluation }
export type Decision = { what: string; why: string; closes?: AskId }
// PR マージまでに残っている大きな塊。終わった塊は外す。blockedBy はその塊を止めている判断
export type Chunk = { what: string; blockedBy?: AskId[] }
export type Remaining = { chunks: Chunk[] }

// 各 ship が書く（since は mod が付ける）
export type Status =
  | { state: 'working'; doing: string }
  | { state: 'converged' }
  | { state: 'stuck'; reason: string }
  | { state: 'waiting'; on: ShipName | 'user'; what: string }
export type Ship = Status & { since: string }

// ページ（ユーザ）が書く
export type Answer = { choice: OptionId } | { text: string }
export type Review = { required?: boolean; approved_since?: string }

// requirement ship が書く。要求とその裏返しのテスト。kind の順にページが描く（logic がこの順に並べて保存する）
export type RequirementKind = '機能' | 'セキュリティ' | '性能' | '可用性' | '運用・監視' | '移行'
export type Test = { act: string; evidence: string }
// ページが「who、can」の 1 文にする
export type Requirement = { kind: RequirementKind; change: '新' | '改'; who: string; can: string; tests: Test[] }
// 要求を指す鍵。ID の代わりに今の文で指す
export type Which = { who: string; can: string }
export type RequirementChange = { op: 'add'; to: Requirement } | { op: 'replace'; which: Which; to: Requirement } | { op: 'remove'; which: Which }
export type Requirements = { requirements: Requirement[] }

// behavior ship が書く。対象システムの振る舞い（event model）と、結合レベルのテスト。moments の順が時間の順
// 新規か、既存の修正か、既存（変えない）か。既存は文脈として描く
export type Novelty = '新' | '改' | '既'
// 値。鍵は盤面の語（事実の属性・コマンドの入力・リードモデルの項目）
export type Values = Record<string, string>
// 業務の事実（過去形）と、それが運ぶ属性。名前が鍵
export type DomainEvent = { name: string; attrs: string[] }
export type Occurrence = { event: string; values: Values }
// 時点を起こす者。on は聴く事実で、それより前の時点で起きる
export type Trigger =
  | { kind: 'screen'; actor: string; screen: string; sketch: string }
  | { kind: 'agent'; agent: string; task: string; sketch: string; on?: string }
  | { kind: 'policy'; rule: string; on: string }
// コマンドの例。expect は起きる事実（起きる順）か、拒否
export type CommandTest = { name: string; given: Occurrence[]; when: Values; expect: Occurrence[] | 'error' }
// 軸の 1 時点。誰かがリードモデルを読み、コマンドを打ち、事実が起きる。コマンドの名前が鍵
export type Moment = {
  change: Novelty; by: Trigger; reads: string[]; command: { name: string; params: string[] }; aggregate: string
  events: DomainEvent[]; otherwise: DomainEvent[]; tests: CommandTest[]
}
// リードモデルの例。rows は見える行で、配列の順が表示の順
export type ReadTest = { name: string; given: Occurrence[]; rows: Values[] }
// 時間を通した 1 つの投影。sources はこれを更新する事実。名前が鍵
export type ReadModel = { change: Novelty; name: string; fields: string[]; sources: string[]; tests: ReadTest[] }
// 読むだけの画面。at の時点（コマンド名）で reads を見て、コマンドは起こさない。画面の名前が鍵
export type View = { change: Novelty; actor: string; screen: string; sketch: string; reads: string[]; at: string }
// 別の流れ。from のコマンドで起きた失敗の、その後の振る舞い（エラー表示・再試行・打ち切り）を自分の軸で描く。名前が鍵
export type Flow = { name: string; from: string; moments: Moment[] }
// 未決定の問い。会社の事実で決められないことと、当面の仮定。at は関わる事実。問いが鍵
export type Hotspot = { question: string; assumption: string; at?: string }
// 軸の 1 件分の名乗り。何の 1 件の話で、どの識別子で束ねるか
export type Identity = { unit: string; key: string }
export type Behavior = { identity?: Identity; moments: Moment[]; views: View[]; readModels: ReadModel[]; flows: Flow[]; hotspots: Hotspot[] }
// 変更。今の鍵（which）で指し、新しい中身は to。moments の add は after の直後に入り、flow を付けるとその流れの軸に入る
export type Keyed<T> = { op: 'add'; to: T } | { op: 'replace'; which: string; to: T } | { op: 'remove'; which: string }
export type MomentChange = { op: 'add'; flow?: string; after?: string; to: Moment } | { op: 'replace'; which: string; to: Moment } | { op: 'remove'; which: string }
export type FlowChange = Keyed<{ name: string; from: string }>
export type BehaviorChanges = {
  identity?: Identity; moments?: MomentChange[]; views?: Keyed<View>[]; readModels?: Keyed<ReadModel>[]; flows?: FlowChange[]; hotspots?: Keyed<Hotspot>[]
}
// ユーザが付箋に付けたコメント（ページが書く）への、ship の返信
export type Reply = { reply: string; at: string }
// 変更の記録。revise_behavior の note と、何を変えたか（at は mod が付ける）
export type JournalEntry = { note: string; changed: string; at: string }
export type BehaviorInput = BehaviorChanges & { note: string; replies?: { comment: string; reply: string }[] }

// DB の文書の置き場所（fleet/fleet-db.ts の paths の形）。1 つの文書は "collection/id"、それ以外は collection
export type DbPaths = {
  brief: string; ships: string; asks: string; decisions: string; remaining: string; answers: string; reviews: string; comments: string
  requirements: string; behavior: string; behaviorJournal: string; behaviorReplies: string; self: string
}

// セッションが属する fleet（mod が $.state に持つ）
export type Role = 'flagship' | ShipName
export type FleetSession = { url: string; role: Role }

// mod が $ から作って tool・hook に渡す、関数の束。$ と $.state の鍵は hooks/register.tsx の中だけにある
export type DbCall = { action: 'get' | 'set'; collection: string; doc_id: string; data?: object; if_version?: number }
export type DbReply = { text?: string; isError?: true; deny?: string }
export type ToolDeclaration = { name: string; description: string; inputSchema: JsonSchemaNode; isDeferred: boolean }
export type ToolReply = { result: string } | { deny: string }
export type Engine = {
  // plugin のディレクトリ（絶対パス）
  root: string
  now: () => Promise<number>
  // このセッションが乗っている fleet
  fleet: () => Promise<FleetSession | undefined>
  board: (session: FleetSession) => Promise<void>
  // LLM が呼べる tool を出す
  offer: (tool: ToolDeclaration) => Promise<void>
  // ArtifactData で fleet の DB を読み書きする
  db: (url: string, call: DbCall) => Promise<DbReply>
  // plugin の中のファイルを読む
}
// LLM が呼ぶ専用 tool。宣言（spec）と処理（run）を 1 つにしたもの。tool は mcp__software-fleet__<spec.name>
export type FleetTool = { tool: string; spec: ToolDeclaration; run: (engine: Engine, input: unknown) => Promise<ToolReply> }

declare module 'claude-code' {
  interface PluginState {
    'software-fleet': { fleet: FleetSession }
  }
  // mod が登録する専用 tool の入力
  interface McpToolInputs {
    'mcp__software-fleet__set_brief': Fleet
    'mcp__software-fleet__ask_user': Ask
    'mcp__software-fleet__record_decision': Decision
    'mcp__software-fleet__set_remaining': Remaining
    'mcp__software-fleet__report_status': { status: Status }
    'mcp__software-fleet__revise_requirements': { changes: RequirementChange[] }
    'mcp__software-fleet__revise_behavior': BehaviorInput
  }
}
