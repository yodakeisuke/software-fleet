import { describe, expect, test } from 'claude-code/testing'

import type { JsonSchema } from '../../../engine-protocol'
import { Schema } from '../../../logic/schema/schema'

const error = (schema: JsonSchema, value: unknown) => Schema.check(schema, value).either(() => '', e => e)
const shape: JsonSchema = {
  type: 'object',
  required: ['name', 'tags'],
  properties: { name: { type: 'string', minLength: 1 }, tags: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', enum: ['a', 'b'] } } },
}

describe('schema', () => {
  test('合えばそのまま通す', () => {
    expect(Schema.check(shape, { name: 'x', tags: ['a'] }).either(v => v, () => null)).toEqual({ name: 'x', tags: ['a'] })
  })

  test('合わない箇所を場所つきで全部挙げる', () => {
    expect(error(shape, { tags: [] })).toBe('入力.name がない / 入力.tags は 1〜2 個')
    expect(error(shape, { name: '', tags: ['c', 'a', 'b'] })).toBe('入力.name が空 / 入力.tags は 1〜2 個 / 入力.tags[0] は a | b のどれか')
    expect(error(shape, 'x')).toBe('入力 は object でなければならない')
  })

  test('文字列は maxLength 文字まで。文字数はコードポイントで数える', () => {
    const short: JsonSchema = { type: 'string', maxLength: 3 }
    expect(error(short, 'あいう')).toBe('')
    expect(error(short, '😀😀😀')).toBe('')
    expect(error(short, 'あいうえ')).toBe('入力 は 3 文字まで（今 4 文字）')
  })

  test('oneOf は 1 値の enum で形を選び、その形の問題を返す。選べなければ選べる値を挙げる', () => {
    const tag = (kind: string, field: string): JsonSchema => ({ type: 'object', required: ['kind', field], properties: { kind: { type: 'string', enum: [kind] } } })
    const either: JsonSchema = { oneOf: [tag('a', 'x'), tag('b', 'y')] }
    expect(error(either, { kind: 'b', y: 1 })).toBe('')
    expect(error(either, { kind: 'b' })).toBe('入力.y がない')
    expect(error(either, { kind: 'c' })).toBe('入力 は kind: a | kind: b のどれかの形')
  })

  test('印のない oneOf は、問題がいちばん少ない形の問題を返す', () => {
    expect(error({ oneOf: [{ type: 'object', required: ['a'] }, { type: 'object', required: ['b', 'c'] }] }, { b: 1 })).toBe('入力.a がない')
  })
})
