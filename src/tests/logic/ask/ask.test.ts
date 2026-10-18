import { describe, expect, test } from 'claude-code/testing'

import { Ask } from '../../../logic/ask/ask'

const option = (id: string) => ({ id, label: id, consequence: `${id} になる`, detail: { text: `${id} の詳細` } })
const ask = { question: 'どちら？', background: { text: '背景', diagram: '<svg/>' }, options: [option('a'), option('b')], recommended: 'a' }
const cells = (rows: number, columns: number) => Array.from({ length: rows }, () => Array.from({ length: columns }, () => ({ rating: '○', note: '' })))
const error = (input: unknown) => Ask.of(input).either(() => '', e => e)

describe('ask', () => {
  test('Ask の項目だけを残す（tool の呼び出しの付帯情報は落とす）', () => {
    expect(Ask.of({ ...ask, tool: 'mcp__software-fleet__ask_user', tool_use_id: 't' }).either(v => v, () => null)).toEqual({ ...ask, evaluation: undefined })
  })

  test('選択肢は 2〜4、推奨は選択肢の id のどれか、id は重ならない', () => {
    expect(error({ ...ask, options: [option('a')] })).toBe('入力.options は 2〜4 個')
    expect(error({ ...ask, recommended: 'z' })).toBe('recommended（z）が options の id のどれでもない')
    expect(error({ ...ask, options: [option('a'), option('a')] })).toBe('options の id が重なっている')
  })

  test('選択肢のボタンの文言と、選んだら何が起きるかは、それぞれ 20 文字まで', () => {
    expect(error({ ...ask, options: [{ ...option('a'), label: 'あ'.repeat(20), consequence: 'い'.repeat(20) }, option('b')] })).toBe('')
    expect(error({ ...ask, options: [{ ...option('a'), label: 'あ'.repeat(21) }, option('b')] })).toBe('入力.options[0].label は 20 文字まで（今 21 文字）')
    expect(error({ ...ask, options: [option('a'), { ...option('b'), consequence: 'い'.repeat(25) }] })).toBe('入力.options[1].consequence は 20 文字まで（今 25 文字）')
  })

  test('評価表は選択肢×評価軸の形', () => {
    const axes = [{ name: '速さ', weight: '高' }, { name: '安全', weight: '中' }]
    expect(error({ ...ask, evaluation: { axes, cells: cells(2, 2) } })).toBe('')
    expect(error({ ...ask, evaluation: { axes, cells: cells(2, 1) } })).toBe('evaluation.cells は options と同じ行数で、各行は axes と同じ数')
    expect(error({ ...ask, evaluation: { axes, cells: [[{ rating: '?', note: '' }]] } })).toContain('入力.evaluation.cells[0][0].rating は ◎ | ○ | △ | × のどれか')
  })


  test('id は出した時刻から作る', () => {
    expect(Ask.id(1792314590261)).toBe('ask-1792314590261')
  })
})
