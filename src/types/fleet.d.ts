export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

// 基本の型。作れるのは logic/primitive の of だけ（brand で素の値と見分ける）
export type NonEmptyString = string & { readonly brand: 'NonEmptyString' }
export type PositiveInt = number & { readonly brand: 'PositiveInt' }
export type NonEmptyList<T> = readonly [T, ...T[]]

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

// fleet の状態（artifact の DB の文書）。置き場所は fleet/<書き手>/...、書くのはその書き手だけ
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
export type Fleet = { brief: string }
export type Ask = { question: string; background: Explain; options: Option[]; recommended: OptionId; evaluation?: Evaluation }
export type Decision = { what: string; why: string; closes?: AskId }
export type Stamped<T> = T & { at: string }

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


// セッションが属する fleet（mod が $.state に持つ）
export type FleetSession = { url: string; role: 'flagship' | ShipName }

declare module 'claude-code' {
  interface PluginState {
    'software-fleet': { fleet: FleetSession }
  }
  // mod が登録する専用 tool の入力
  interface McpToolInputs {
    'mcp__software-fleet__set_brief': Fleet
    'mcp__software-fleet__ask_user': Ask
    'mcp__software-fleet__record_decision': Decision
    'mcp__software-fleet__report_status': { status: Status }
  }
}
