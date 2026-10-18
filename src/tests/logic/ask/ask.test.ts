import { describe, expect, test } from 'claude-code/testing'

import type { Ask as AskDoc, Cell } from '../../../types/fleet'
import { Ask } from '../../../logic/ask/ask'

const option = (id: string) => ({ id, label: id, consequence: `${id} になる`, detail: { text: `${id} の詳細` } })
const ask: AskDoc = { question: 'どちら？', background: { text: '背景', diagram: '<svg/>' }, options: [option('a'), option('b')], recommended: 'a' }
const cells = (rows: number, columns: number): Cell[][] => Array.from({ length: rows }, () => Array.from({ length: columns }, () => ({ rating: '○', note: '' })))
const error = (input: AskDoc) => Ask.of(input).either(() => '', e => e)

describe('ask', () => {
  test('選択肢は 2〜4 件', () => {
    expect(error({ ...ask, options: [option('a')] })).toBe('options は 2〜4 件（今 1 件）')
    expect(error({ ...ask, options: ['a', 'b', 'c', 'd'].map(option) })).toBe('')
    expect(error({ ...ask, options: ['a', 'b', 'c', 'd', 'e'].map(option) })).toBe('options は 2〜4 件（今 5 件）')
  })

  test('推奨は選択肢の id のどれかで、id は重ならない', () => {
    expect(error({ ...ask, recommended: 'z' })).toBe('recommended（z）が options の id のどれでもない')
    expect(error({ ...ask, options: [option('a'), option('a')] })).toBe('options の id が重なっている')
  })

  test('ボタンの文言と、選んだら何が起きるかは、それぞれ 20 文字まで（コードポイントで数える）', () => {
    expect(error({ ...ask, options: [{ ...option('a'), label: 'あ'.repeat(20), consequence: '😀'.repeat(20) }, option('b')] })).toBe('')
    expect(error({ ...ask, options: [{ ...option('a'), label: 'あ'.repeat(21) }, option('b')] })).toBe('options[0].label は 20 文字まで（今 21 文字）')
    expect(error({ ...ask, options: [option('a'), { ...option('b'), consequence: 'い'.repeat(25) }] })).toBe('options[1].consequence は 20 文字まで（今 25 文字）')
  })

  test('評価表は選択肢×評価軸の形', () => {
    const axes = [{ name: '速さ', weight: '高' }, { name: '安全', weight: '中' }]
    expect(error({ ...ask, evaluation: { axes, cells: cells(2, 2) } })).toBe('')
    expect(error({ ...ask, evaluation: { axes, cells: cells(2, 1) } })).toBe('evaluation.cells は options と同じ行数で、各行は axes と同じ数')
  })

  test('id は出した時刻から作る', () => {
    expect(Ask.id(1792314590261)).toBe('ask-1792314590261')
  })
})
