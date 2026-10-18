import type { JsonSchema, Result as Data } from '../../engine-protocol'
import { Result } from '../primitive/result'

// --- public interface
export const Schema = {
  check: <T>(schema: JsonSchema, value: unknown) => check<T>(schema, value),
}

// --- operations
const check = <T>(schema: JsonSchema, value: unknown) => verdict<T>(value, problems(schema, value, '入力'))

// --- business rules
// 問題がなければ値をそのまま通し、あれば全部を 1 つの文にして失敗にする
const verdict = <T>(value: unknown, found: string[]) =>
  Result.given<Data<T, string>>(found.length === 0 ? { ok: true, value: value as T } : { ok: false, error: found.join(' / ') })
// スキーマに合わない箇所を、場所つきで全部挙げる。型が違えば中は見ない
const problems = (schema: JsonSchema, value: unknown, at: string): string[] =>
  schema.oneOf ? oneOf(schema.oneOf, value, at)
    : !fits(schema, value) ? [`${at} は ${schema.type} でなければならない`]
      : [...text(schema, value, at), ...list(schema, value, at), ...fields(schema, value, at)]
// type の指定がなければ何でもよい
const fits = (schema: JsonSchema, value: unknown) => schema.type === undefined || {
  object: typeof value === 'object' && value !== null && !Array.isArray(value),
  array: Array.isArray(value),
  string: typeof value === 'string',
}[schema.type]
// 文字列は minLength〜maxLength 文字で、enum があればそのどれか
const text = (schema: JsonSchema, value: unknown, at: string) => typeof value !== 'string' ? [] : [...short(schema, value, at), ...long(schema, value, at), ...outside(schema, value, at)]
// 文字列が minLength より短い（文字数は JSON Schema と同じくコードポイントで数える）
const short = (schema: JsonSchema, value: string, at: string) => ([...value].length < (schema.minLength ?? 0) ? [`${at} が空`] : [])
// 文字列が maxLength より長い
const long = (schema: JsonSchema, value: string, at: string) => {
  const length = [...value].length
  return length > (schema.maxLength ?? Infinity) ? [`${at} は ${schema.maxLength} 文字まで（今 ${length} 文字）`] : []
}
// 文字列が enum のどれでもない
const outside = (schema: JsonSchema, value: string, at: string) => (schema.enum && !schema.enum.includes(value) ? [`${at} は ${schema.enum.join(' | ')} のどれか`] : [])
// 配列は個数の範囲に収まり、要素ごとに items を満たす
const list = (schema: JsonSchema, value: unknown, at: string) => !Array.isArray(value) ? [] : [
  ...count(schema, value.length, at),
  ...value.flatMap((item, index) => (schema.items ? problems(schema.items, item, `${at}[${index}]`) : [])),
]
// 配列の個数が minItems〜maxItems の外
const count = (schema: JsonSchema, length: number, at: string) => {
  const [min, max] = [schema.minItems ?? 0, schema.maxItems ?? Infinity]
  return length < min || length > max ? [`${at} は ${min}〜${max} 個`] : []
}
// オブジェクトは required が揃い、ある項目はそれぞれのスキーマを満たす
const fields = (schema: JsonSchema, value: unknown, at: string) => schema.type !== 'object' ? [] : [
  ...(schema.required ?? []).filter(key => (value as Record<string, unknown>)[key] === undefined).map(key => `${at}.${key} がない`),
  ...Object.entries(schema.properties ?? {}).flatMap(([key, inner]) => present(value, key) ? problems(inner, (value as Record<string, unknown>)[key], `${at}.${key}`) : []),
]
// その項目に値が入っている
const present = (value: unknown, key: string) => (value as Record<string, unknown>)[key] !== undefined
// oneOf は 1 値の enum（state など）で形を選び、その形の問題を返す。どの形も選べなければ、選べる値を挙げる
const oneOf = (branches: readonly JsonSchema[], value: unknown, at: string) => {
  const chosen = branches.filter(branch => tags(branch).every(([key, tag]) => field(value, key) === tag))
  return chosen.length > 0 ? fewest(chosen.map(branch => problems(branch, value, at))) : [`${at} は ${branches.flatMap(tags).map(([key, tag]) => `${key}: ${tag}`).join(' | ')} のどれかの形`]
}
// 形を選ぶ印: 値が 1 つだけの enum を持つ項目
const tags = (branch: JsonSchema) => Object.entries(branch.properties ?? {}).flatMap(([key, inner]) => (inner.enum?.length === 1 ? [[key, inner.enum[0]] as const] : []))
// オブジェクトでなければ undefined
const field = (value: unknown, key: string) => (value as Record<string, unknown> | null | undefined)?.[key]
// 問題がいちばん少ない挙げ方
const fewest = (lists: string[][]) => lists.reduce((best, found) => (found.length < best.length ? found : best))
