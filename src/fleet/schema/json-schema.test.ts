import { describe, expect, test } from 'claude-code/testing'

import type { JsonSchemaNode } from '../../types/fleet'
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

  test('pattern のある文字列は、それに合うものだけを通す', () => {
    expect(error({ type: 'string', pattern: '^a' }, 'ab')).toBe('')
    expect(error({ type: 'string', pattern: '^a' }, 'b')).toBe('入力 は ^a に合わない')
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

  test('鍵が自由なオブジェクトは、どの項目も additionalProperties を満たす', () => {
    const values: JsonSchemaNode = { type: 'object', additionalProperties: { type: 'string' } }
    expect(error(values, { 金額: '3万円', 用途: '交通費' })).toBe('')
    expect(error(values, { 金額: 30000 })).toBe('入力.金額 は string でなければならない')
  })

  test('$ref は一番外側の $defs の定義として検査する', () => {
    const schema: JsonSchemaNode = { type: 'object', required: ['a'], properties: { a: JsonSchema.ref('word') }, $defs: { word: { type: 'string', minLength: 1 } } }
    expect(error(schema, { a: 'x' })).toBe('')
    expect(error(schema, { a: '' })).toBe('入力.a が空')
    expect(JsonSchema.check(schema, { a: 'x', b: 1 }).either<unknown>(v => v, e => e)).toEqual({ a: 'x' })
  })

  test('通した値は、スキーマにある項目だけにする。oneOf は合う形の項目を残す', () => {
    const kept = (schema: JsonSchemaNode, value: unknown) => JsonSchema.check(schema, value).either<unknown>(v => v, e => e)
    expect(kept(shape, { name: 'x', tags: ['a'], extra: 1 })).toEqual({ name: 'x', tags: ['a'] })
    expect(kept({ type: 'array', items: { type: 'object', properties: { a: { type: 'string' } } } }, [{ a: 'x', b: 'y' }])).toEqual([{ a: 'x' }])
    expect(kept({ type: 'object', additionalProperties: { type: 'string' } }, { 金額: '3万円' })).toEqual({ 金額: '3万円' })
    const either: JsonSchemaNode = { oneOf: [
      { type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: ['a'] }, x: { type: 'string' } } },
      { type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: ['b'] }, y: { type: 'string' } } },
    ] }
    expect(kept(either, { kind: 'b', x: '1', y: '2' })).toEqual({ kind: 'b', y: '2' })
  })
})

describe('json-schema: 数・真偽と、鍵が自由なオブジェクトの $ref', () => {
  test('number と boolean を見分け、additionalProperties の $ref も $defs で解く', () => {
    const schema: JsonSchemaNode = {
      type: 'object',
      properties: { span: { type: 'array', items: { type: 'number' } }, pk: { type: 'boolean' }, out: { type: 'object', additionalProperties: { $ref: '#/$defs/wire' } } },
      $defs: { wire: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 } } } },
    }
    expect(error(schema, { span: [0, 2], pk: true, out: { 1: { name: '注文' } } })).toBe('')
    expect(error(schema, { span: ['0'], pk: 'yes', out: { 1: { label: '注文' } } })).toBe('入力.span[0] は number でなければならない / 入力.pk は boolean でなければならない / 入力.out.1.name がない')
  })
})
