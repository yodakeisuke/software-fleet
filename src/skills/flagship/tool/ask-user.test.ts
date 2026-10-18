import { describe, expect, test } from 'claude-code/testing'

import { JsonSchema } from '../../../fleet/json-schema'
import { askUser } from './ask-user'

describe('ask-user', () => {
  test('ask_user の形: 評価表のマスは ◎ ○ △ × のどれか', () => {
    const option = (id: string) => ({ id, label: id, consequence: id, detail: { text: id } })
    const ask = { question: 'q', background: { text: 'b' }, options: [option('a'), option('b')], recommended: 'a' }
    expect(JsonSchema.check(askUser.spec.inputSchema, ask).either(() => '', e => e)).toBe('')
    const evaluation = { axes: [{ name: 'x', weight: '高' }], cells: [[{ rating: '?', note: '' }], [{ rating: '○', note: '' }]] }
    expect(JsonSchema.check(askUser.spec.inputSchema, { ...ask, evaluation }).either(() => '', e => e)).toBe('入力.evaluation.cells[0][0].rating は ◎ | ○ | △ | × のどれか')
  })
})
