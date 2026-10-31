import { describe, expect, test } from 'claude-code/testing'

import type { DbCall, Engine } from '../../types/fleet'
import { reviseDocument } from './revise-document'

const section = { heading: '手順', blocks: [{ kind: 'steps', items: ['押す'] }] }
// 書いた先と版と中身。書かずに拒んだら deny。stored は今 DB にある文書の 1 行
const written = async (input: unknown, stored = '') => {
  const calls: DbCall[] = []
  const engine = {
    fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role: 'cs' }),
    db: async (_url: string, call: DbCall) => { calls.push(call); return { text: call.action === 'get' ? stored : 'ok' } },
  } as unknown as Engine
  const reply = await reviseDocument.run(engine, input)
  const set = calls.find(call => call.action === 'set')
  return 'deny' in reply ? reply : { at: `${set?.collection}/${set?.doc_id}`, if_version: set?.if_version, data: set?.data }
}
const add = (to: unknown) => ({ document: 'guide', changes: [{ op: 'add', to }] })

describe('revise-document', () => {
  test('章を文書ごとの置き場所に書く', async () => {
    const data = { sections: [section] }
    expect(await written(add(section))).toEqual({ at: 'fleet/cs/deliverables/guide', data })
    expect(await written({ ...add(section), document: 'unaskedSpecs' })).toEqual({ at: 'fleet/cs/deliverables/unasked-specs', data })
    expect(await written({ ...add(section), document: 'operationsDesign' })).toEqual({ at: 'fleet/ops/deliverables/operations-design', data })
  })

  test('今の文書に変更を当てて、読んだ版に固定して書く', async () => {
    const other = { heading: 'エラー', blocks: [{ kind: 'warning', text: '消える' }] }
    const stored = `{"id":"guide","data":${JSON.stringify({ sections: [section] })},"version":7}`
    expect(await written(add(other), stored)).toEqual({ at: 'fleet/cs/deliverables/guide', if_version: 7, data: { sections: [section, other] } })
  })

  test('決まった部品でなければ書かずに拒む', async () => {
    expect(await written(add({ heading: '手順', blocks: [{ kind: 'html', html: '<p>' }] }))).toHaveProperty('deny')
  })

  test('svg は、最初のタグに viewBox のあるものだけを通す', async () => {
    const figure = (svg: string) => add({ heading: '図', blocks: [{ kind: 'svg', svg }] })
    expect(await written(figure('<svg viewBox="0 0 10 10"><rect/></svg>'))).toHaveProperty('at')
    for (const svg of ['<svg><rect/></svg>', '<div viewBox="0 0 1 1"></div>', '<svg data-viewBox="1"></svg>']) {
      expect(await written(figure(svg))).toEqual({ deny: '入力.changes[0].to.blocks[0].svg は ^\\s*<svg\\b[^>]*\\sviewBox= に合わない' })
    }
  })
})
