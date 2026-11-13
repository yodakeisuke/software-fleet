import { describe, expect, test } from 'claude-code/testing'

import type { Model, ModelObject } from '../../../types/fleet'
import { CodeModel } from './code-model'
import { Placement } from './placement'

const model = (objects: ModelObject[]): Model => ({ ...CodeModel.empty(), name: '注文', types: [{ id: 'order', name: '注文', world: 'domain', form: 'lifecycle', objects }] })

describe('placement', () => {
  test('箱の位置（at）は、型の箱の全部に付けるか全部省く', () => {
    expect(Placement.problems(model([{ id: 'a', name: '下書き' }, { id: 'b', name: '確定済' }]))).toEqual([])
    expect(Placement.problems(model([{ id: 'a', name: '下書き', at: [0, 0] }, { id: 'b', name: '確定済', at: [1, 0] }]))).toEqual([])
    expect(Placement.problems(model([{ id: 'a', name: '下書き', at: [0, 0] }, { id: 'b', name: '確定済' }]))).toEqual(['型「注文」の at は箱の全部に付けるか全部省く'])
  })

  test('at は [列, 行] の 0 以上の整数で、2 つの箱が同じ位置に重ならない', () => {
    expect(Placement.problems(model([{ id: 'a', name: '下書き', at: [0.5, 0] }, { id: 'b', name: '確定済', at: [-1, 0] }, { id: 'c', name: '取消', at: [2] }]))).toEqual([
      '型「注文」の「下書き」の at は [列, 行] の 0 以上の整数', '型「注文」の「確定済」の at は [列, 行] の 0 以上の整数', '型「注文」の「取消」の at は [列, 行] の 0 以上の整数',
    ])
    expect(Placement.problems(model([{ id: 'a', name: '下書き', at: [0, 1] }, { id: 'b', name: '確定済', at: [0, 1] }]))).toEqual(['型「注文」の at「[0,1]」が重なっている'])
  })
})
