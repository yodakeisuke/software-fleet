import { describe, expect, test } from 'claude-code/testing'

import type { Block, DocumentChange, ReaderDocument as Doc, Role, Section } from '../../types/fleet'
import { ReaderDocument } from './reader-document'

const section = (heading: string, blocks: Block[] = [{ kind: 'text', text: '本文' }]): Section => ({ heading, blocks })
const doc: Doc = { title: '題', sections: [section('手順'), section('エラー')] }
const revise = (changes: DocumentChange[], role: Role = 'cs', current: Doc | undefined = doc) => ReaderDocument.revise(role, current, { document: 'guide', changes }).either<unknown>(value => value, error => error)
const headings = (changes: DocumentChange[]) => (revise(changes) as Doc).sections.map(s => s.heading)

describe('reader-document', () => {
  test('足すは末尾か指定の章の次に、直すはその場で、消すは取り除く', () => {
    expect(headings([{ op: 'add', section: section('用語') }])).toEqual(['手順', 'エラー', '用語'])
    expect(headings([{ op: 'add', section: section('前提'), after: '手順' }])).toEqual(['手順', '前提', 'エラー'])
    expect(headings([{ op: 'replace', heading: '手順', section: section('操作') }])).toEqual(['操作', 'エラー'])
    expect(headings([{ op: 'remove', heading: '手順' }])).toEqual(['エラー'])
  })

  test('題は渡したときだけ変わり、渡さなければ残る', () => {
    expect(revise([])).toEqual(doc)
    expect(ReaderDocument.revise('cs', doc, { document: 'guide', title: '新', changes: [] }).either<unknown>(value => value, error => error)).toEqual({ ...doc, title: '新' })
  })

  test('まだない文書には足せる', () => {
    expect(ReaderDocument.revise('cs', undefined, { document: 'guide', changes: [{ op: 'add', section: section('手順') }] }).either<unknown>(value => value, error => error)).toEqual({ sections: [section('手順')] })
  })

  test('文書は持ち主の ship だけが書ける', () => {
    expect(revise([], 'ops')).toBe('guide を書けるのは cs だけ')
  })

  test('指した章がなければ、今ある見出しを全部挙げて、何も変えない', () => {
    expect(revise([{ op: 'remove', heading: '無い' }])).toBe('見つからない: 無い。今ある章: 手順、エラー')
    expect(revise([{ op: 'add', section: section('前提'), after: '無い' }])).toBe('見つからない: 無い。今ある章: 手順、エラー')
  })

  test('同じ見出しの章と、中身のない章は拒む', () => {
    expect(revise([{ op: 'add', section: section('手順') }])).toBe('章「手順」が重なっている')
    expect(revise([{ op: 'add', section: section('空', []) }])).toBe('章「空」に中身がない')
  })

  test('表の列数がそろっていなければ拒む', () => {
    expect(revise([{ op: 'add', section: section('表', [{ kind: 'table', head: ['a', 'b'], rows: [['1']] }]) }])).toBe('章「表」の表の列数がそろっていない')
  })

  test('svg は viewBox のある <svg>…</svg> だけを通す', () => {
    const ok: Block = { kind: 'svg', svg: '<svg viewBox="0 0 10 10"><rect/></svg>' }
    expect(headings([{ op: 'add', section: section('図', [ok]) }])).toContain('図')
    for (const svg of ['<svg><rect/></svg>', '<div viewBox="0 0 1 1"></div>', '<svg viewBox="0 0 1 1"></svg><img src=x>']) {
      expect(revise([{ op: 'add', section: section('図', [{ kind: 'svg', svg }]) }])).toBe('章「図」の svg は viewBox のある <svg>…</svg> だけにする')
    }
  })
})
