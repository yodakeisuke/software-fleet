import type { JsonSchemaNode, Result as Data } from '../../../types/fleet'
import { Result } from '../../../logic/primitive/result'

// tool の入力の形（型・必須・空でない・enum）を、LLM に渡したのと同じ JSON Schema で検査する。意味の検査は logic がする
export const JsonSchema = {
  check: <T>(schema: JsonSchemaNode, value: unknown) => verdict<T>(value, problems(schema, value, '入力')),
}

// 問題がなければ値をそのまま通し、あれば全部を 1 つの文にして失敗にする
const verdict = <T>(value: unknown, found: string[]) =>
  Result.given<Data<T, string>>(found.length === 0 ? { ok: true, value: value as T } : { ok: false, error: found.join(' / ') })
// スキーマに合わない箇所を、場所つきで全部挙げる。型が違えば中は見ない
const problems = (schema: JsonSchemaNode, value: unknown, at: string): string[] =>
  schema.oneOf ? oneOf(schema.oneOf, value, at)
    : !fits(schema, value) ? [`${at} は ${schema.type} でなければならない`]
      : [...text(schema, value, at), ...list(schema, value, at), ...fields(schema, value, at)]
// type の指定がなければ何でもよい
const fits = (schema: JsonSchemaNode, value: unknown) => schema.type === undefined || {
  object: typeof value === 'object' && value !== null && !Array.isArray(value),
  array: Array.isArray(value),
  string: typeof value === 'string',
}[schema.type]
// 文字列は minLength 以上で、enum があればそのどれか
const text = (schema: JsonSchemaNode, value: unknown, at: string) => typeof value !== 'string' ? [] : [
  ...([...value].length < (schema.minLength ?? 0) ? [`${at} が空`] : []),
  ...(schema.enum && !schema.enum.includes(value) ? [`${at} は ${schema.enum.join(' | ')} のどれか`] : []),
]
// 配列は要素ごとに items を満たす
const list = (schema: JsonSchemaNode, value: unknown, at: string) =>
  !Array.isArray(value) || !schema.items ? [] : value.flatMap((item, index) => problems(schema.items as JsonSchemaNode, item, `${at}[${index}]`))
// オブジェクトは required が揃い、ある項目はそれぞれのスキーマを満たす
const fields = (schema: JsonSchemaNode, value: unknown, at: string) => schema.type !== 'object' ? [] : [
  ...(schema.required ?? []).filter(key => field(value, key) === undefined).map(key => `${at}.${key} がない`),
  ...Object.entries(schema.properties ?? {}).flatMap(([key, inner]) => (field(value, key) === undefined ? [] : problems(inner, field(value, key), `${at}.${key}`))),
]
// oneOf は 1 値の enum（state など）で形を選び、その形の問題を返す。どの形も選べなければ、選べる値を挙げる
const oneOf = (branches: readonly JsonSchemaNode[], value: unknown, at: string) => {
  const chosen = branches.filter(branch => tags(branch).every(([key, tag]) => field(value, key) === tag))
  return chosen.length > 0 ? fewest(chosen.map(branch => problems(branch, value, at))) : [`${at} は ${branches.flatMap(tags).map(([key, tag]) => `${key}: ${tag}`).join(' | ')} のどれかの形`]
}
// 形を選ぶ印: 値が 1 つだけの enum を持つ項目
const tags = (branch: JsonSchemaNode) => Object.entries(branch.properties ?? {}).flatMap(([key, inner]) => (inner.enum?.length === 1 ? [[key, inner.enum[0]] as const] : []))
// オブジェクトでなければ undefined
const field = (value: unknown, key: string) => (value as Record<string, unknown> | null | undefined)?.[key]
// 問題がいちばん少ない挙げ方
const fewest = (lists: string[][]) => lists.reduce((best, found) => (found.length < best.length ? found : best))
