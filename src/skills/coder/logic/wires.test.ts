import { describe, expect, test } from 'claude-code/testing'

import type { ModelFlow, Model, ModelType } from '../../../types/fleet'
import { CodeModel } from './code-model'
import { Wires } from './wires'

const order: ModelType = { id: 'order', name: '注文', world: 'domain', form: 'lifecycle', objects: [{ id: 'draft', name: '下書き', holds: 'unit' }, { id: 'confirmed', name: '確定済', holds: 'unit' }] }
const summary: ModelType = { id: 'summary', name: '注文の要約', world: 'api', form: 'record', objects: [{ id: 'v', name: '要約', holds: 'unit' }] }
const money: ModelType = { id: 'money', name: '金額', world: 'domain', form: 'value', objects: [{ id: 'v', name: '金額', holds: { prim: '整数' } }] }
const flow = (steps: ModelFlow['steps'], columns: ModelFlow['columns'] = [{ name: '依頼者', kind: 'api' }, { name: '注文' }]): ModelFlow => ({ id: 'f', name: '確定する', columns, start: { 0: '確定の依頼' }, steps })
const model = (flows: ModelFlow[]): Model => ({
  ...CodeModel.empty(), name: '注文', types: [order, summary, money],
  logic: [{ id: 'advance', name: '注文を進める', layer: 'domain' }, { id: 'total', name: '合計を出す', layer: 'domain' }, { id: 'read', name: '読む', layer: 'persistence' }], flows,
})

describe('wires', () => {
  test('線の名前は末尾の型名（最長一致）で構造の型に結ばれ、✓ と ×N は除く', () => {
    const m = model([])
    expect(Wires.typeOf(m, '注文〈下書き〉')?.id).toBe('order')
    expect(Wires.typeOf(m, '確定済の注文 ✓')?.id).toBe('order')
    expect(Wires.typeOf(m, '注文の要約 ×N')?.id).toBe('summary')
    expect(Wires.typeOf(m, '確定した')).toBeUndefined()
  })

  test('〈〉で状態を言う線は型に結べて、状態はその型の箱の名前。状態を言わない線は結べなくてよい', () => {
    expect(Wires.problems(model([flow([{ logic: 'read', span: [0, 1], out: { 1: { name: '注文〈下書き｜確定済〉' } } }])]))).toEqual([])
    expect(Wires.problems(model([flow([{ logic: 'read', span: [0, 1], out: { 1: { name: '伝票〈下書き〉' } } }])]))).toEqual(['流れ「確定する」の線「伝票〈下書き〉」が型に結べない（〈 の前の末尾を型の名前にする）'])
    expect(Wires.problems(model([flow([{ logic: 'read', span: [0, 1], out: { 1: { name: '注文〈下書き｜出荷中〉' } } }])]))).toEqual(['流れ「確定する」の線「注文〈下書き｜出荷中〉」の状態「出荷中」が型「注文」の箱にない'])
    expect(Wires.problems(model([flow([], [{ name: '依頼者' }, { name: '支払〈未払〉' }])]))).toEqual(['流れ「確定する」の線「支払〈未払〉」が型に結べない（〈 の前の末尾を型の名前にする）'])
  })

  test('ドメインの処理の段は、型に結べる線を 1 本は出す（箱の種類はそこから導く）。削る段は除く', () => {
    expect(Wires.problems(model([flow([{ logic: 'advance', span: [1, 1], out: { 1: { name: '確定済の注文 ✓' } } }])]))).toEqual([])
    expect(Wires.problems(model([flow([{ logic: 'total', span: [1, 1], out: { 1: { name: '合計' } } }])]))).toEqual(['流れ「確定する」の段「合計を出す」はドメインの処理なのに、型に結べる線を出していない（箱の種類が決まらない）'])
    expect(Wires.problems(model([flow([{ logic: 'total', span: [1, 1], out: { 1: { name: '合計の金額' } } }])]))).toEqual([])
    expect(Wires.problems(model([flow([{ logic: 'advance', span: [1, 1], change: '削' }, { logic: 'read', span: [0, 1] }])]))).toEqual([])
  })
})
