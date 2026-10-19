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

// DB の文書の置き場所（fleet/fleet-db.ts の paths の形）。1 つの文書は "collection/id"、それ以外は collection
export type DbPaths = { brief: string; ships: string; asks: string; decisions: string; remaining: string; answers: string; reviews: string; comments: string; requirements: string; self: string }

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
  }
}
