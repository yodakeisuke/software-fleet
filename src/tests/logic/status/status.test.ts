import { describe, expect, test } from 'claude-code/testing'

import { Ship } from '../../../logic/ship/ship'
import { Status } from '../../../logic/status/status'

const value = (input: unknown) => Status.of(input).either<unknown>(v => v, e => e)

describe('status', () => {
  test('state ごとに要る項目がある', () => {
    expect(value({ status: { state: 'working', doing: 'API を設計中' } })).toEqual({ state: 'working', doing: 'API を設計中' })
    expect(value({ status: { state: 'converged' } })).toEqual({ state: 'converged' })
    expect(value({ status: { state: 'stuck' } })).toBe('入力.status.reason がない')
    expect(value({ status: { state: 'waiting', on: 'user', what: '判断' } })).toEqual({ state: 'waiting', on: 'user', what: '判断' })
    expect(value({ status: { state: 'waiting', on: 'nobody', what: '判断' } })).toContain('入力.status.on は')
  })

  test('Status の項目だけを残す', () => {
    expect(value({ status: { state: 'converged', extra: 1 }, tool: 'x' })).toEqual({ state: 'converged' })
  })

  test('同梱 skill の呼び出しから ship を知る', () => {
    expect(Ship.of('software-fleet:code-design').either(v => v, e => e)).toBe('code-design')
    expect(Ship.of('software-fleet:set-afloat').either(v => v, () => 'none')).toBe('none')
    expect(Ship.of('code-design').either(v => v, () => 'none')).toBe('none')
  })
})
