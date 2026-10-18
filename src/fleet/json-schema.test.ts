import { describe, expect, test } from 'claude-code/testing'

import type { JsonSchemaNode } from '../types/fleet'
import { JsonSchema } from './json-schema'

const error = (schema: JsonSchemaNode, value: unknown) => JsonSchema.check(schema, value).either(() => '', e => e)
const shape: JsonSchemaNode = {
  type: 'object',
  required: ['name', 'tags'],
  properties: { name: { type: 'string', minLength: 1 }, tags: { type: 'array', items: { type: 'string', enum: ['a', 'b'] } } },
}

describe('json-schema', () => {
  test('合えばそのまま通す', () => {
    expect(JsonSchema.check(shape, { name: 'x', tags: ['a'] }).either<unknown>(v => v, () => null)).toEqual({ name: 'x', tags: ['a'] })
  })

  test('合わない箇所を場所つきで全部挙げる', () => {
    expect(error(shape, { tags: 'a' })).toBe('入力.name がない / 入力.tags は array でなければならない')
    expect(error(shape, { name: '', tags: ['c', 'a'] })).toBe('入力.name が空 / 入力.tags[0] は a | b のどれか')
    expect(error(shape, 'x')).toBe('入力 は object でなければならない')
  })

  test('oneOf は 1 値の enum で形を選び、その形の問題を返す。選べなければ選べる値を挙げる', () => {
    const tag = (kind: string, field: string): JsonSchemaNode => ({ type: 'object', required: ['kind', field], properties: { kind: { type: 'string', enum: [kind] } } })
    const either: JsonSchemaNode = { oneOf: [tag('a', 'x'), tag('b', 'y')] }
    expect(error(either, { kind: 'b', y: 1 })).toBe('')
    expect(error(either, { kind: 'b' })).toBe('入力.y がない')
    expect(error(either, { kind: 'c' })).toBe('入力 は kind: a | kind: b のどれかの形')
  })

  test('印のない oneOf は、問題がいちばん少ない形の問題を返す', () => {
    expect(error({ oneOf: [{ type: 'object', required: ['a'] }, { type: 'object', required: ['b', 'c'] }] }, { b: 1 })).toBe('入力.a がない')
  })
})
