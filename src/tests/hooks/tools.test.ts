import { describe, expect, test } from 'claude-code/testing'

import { JsonSchema } from '../../hooks/json-schema'
import { askUserTool, reportStatusTool } from '../../hooks/tools'

const status = (value: unknown) => JsonSchema.check(reportStatusTool.inputSchema, { status: value }).either<unknown>(() => '', e => e)

describe('tools', () => {
  test('report_status は state ごとに要る項目がある', () => {
    expect(status({ state: 'working', doing: 'API を設計中' })).toBe('')
    expect(status({ state: 'converged' })).toBe('')
    expect(status({ state: 'stuck' })).toBe('入力.status.reason がない')
    expect(status({ state: 'waiting', on: 'user', what: '判断' })).toBe('')
    expect(status({ state: 'waiting', on: 'nobody', what: '判断' })).toContain('入力.status.on は')
    expect(status({ state: 'done' })).toBe('入力.status は state: working | state: converged | state: stuck | state: waiting のどれかの形')
  })

  test('ask_user の形: 評価表のマスは ◎ ○ △ × のどれか', () => {
    const option = (id: string) => ({ id, label: id, consequence: id, detail: { text: id } })
    const ask = { question: 'q', background: { text: 'b' }, options: [option('a'), option('b')], recommended: 'a' }
    expect(JsonSchema.check(askUserTool.inputSchema, ask).either(() => '', e => e)).toBe('')
    const evaluation = { axes: [{ name: 'x', weight: '高' }], cells: [[{ rating: '?', note: '' }], [{ rating: '○', note: '' }]] }
    expect(JsonSchema.check(askUserTool.inputSchema, { ...ask, evaluation }).either(() => '', e => e)).toBe('入力.evaluation.cells[0][0].rating は ◎ | ○ | △ | × のどれか')
  })
})
