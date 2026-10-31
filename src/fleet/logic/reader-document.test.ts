import { describe, expect, test } from 'claude-code/testing'

import type { Block, DocumentChange, Section } from '../../types/fleet'
import { ReaderDocument } from './reader-document'

const section = (heading: string, blocks: Block[] = [{ kind: 'text', text: '本文' }]): Section => ({ heading, blocks })
const current = [section('手順'), section('エラー')]
const revise = (changes: DocumentChange[], from: Section[] = current) => ReaderDocument.revise(from, changes).either<unknown>(value => value, error => error)
const headings = (changes: DocumentChange[]) => (revise(changes) as Section[]).map(s => s.heading)

describe('reader-document', () => {
  test('足すは末尾か指定の章の次に、直すはその場で、消すは取り除く', () => {
    expect(headings([{ op: 'add', to: section('用語') }])).toEqual(['手順', 'エラー', '用語'])
    expect(headings([{ op: 'add', to: section('前提'), after: '手順' }])).toEqual(['手順', '前提', 'エラー'])
    expect(headings([{ op: 'replace', which: '手順', to: section('操作') }])).toEqual(['操作', 'エラー'])
    expect(headings([{ op: 'remove', which: '手順' }])).toEqual(['エラー'])
  })

  test('指した章がなければ、今ある見出しを全部挙げて、何も変えない', () => {
    expect(revise([{ op: 'remove', which: '無い' }])).toBe('見つからない: 無い。今ある章: 手順、エラー')
    expect(revise([{ op: 'add', to: section('前提'), after: '無い' }])).toBe('見つからない: 無い。今ある章: 手順、エラー')
    expect(revise([{ op: 'remove', which: '無い' }], [])).toBe('見つからない: 無い。今ある章: なし')
  })

  test('同じ見出しの章は拒む', () => {
    expect(revise([{ op: 'add', to: section('手順') }])).toBe('章「手順」が重なっている')
  })

  test('表の列数がそろっていなければ拒む', () => {
    const table = (rows: string[][]): DocumentChange => ({ op: 'add', to: section('表', [{ kind: 'table', head: ['a', 'b'], rows }]) })
    expect(headings([table([['1', '2']])])).toContain('表')
    expect(revise([table([['1']])])).toBe('章「表」の表の列数がそろっていない')
  })
})
