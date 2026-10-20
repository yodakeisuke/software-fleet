import { describe, expect, test } from 'claude-code/testing'

import type { Behavior, CaseRef, Quality as QualityDoc, QualityInput, Requirement } from '../../../types/fleet'
import { Quality } from './quality'

const requirement: Requirement = { kind: '機能', change: '新', who: '経理担当は', can: '予算を承認できる', tests: [{ act: '予算を承認する', evidence: '一覧に載る' }] }
const moment = (name: string, tests: string[]) => ({ command: { name, params: [] }, tests: tests.map(t => ({ name: t })) })
const behavior = {
  moments: [moment('経費を申請する', ['申請される'])], flows: [{ name: '差し戻し', from: '経費を申請する', moments: [moment('再申請する', ['再申請される'])] }],
  readModels: [{ name: '申請一覧', tests: [{ name: '新しい順' }] }], views: [], hotspots: [],
} as unknown as Behavior
const all = Quality.cases([requirement], behavior)
const [approve, apply] = all as [CaseRef, CaseRef, ...CaseRef[]]
const empty: QualityDoc = { checks: [], findings: [], charters: [] }
const pass = (c: CaseRef) => ({ ...c, outcome: '合格' as const, saw: '見た' })
const revised = (current: QualityDoc, input: QualityInput) => Quality.revise(current, input, { cases: all, now: 'T1' }).either<QualityDoc | string>(doc => doc, error => error)

describe('quality', () => {
  test('ケースは要求のテストと、本流・別の流れ・リードモデルの例', () => {
    expect(all).toEqual([
      { ship: 'requirement', of: '経理担当は、予算を承認できる', name: '予算を承認する' },
      { ship: 'behavior', of: '経費を申請する', name: '申請される' },
      { ship: 'behavior', of: '再申請する', name: '再申請される' },
      { ship: 'behavior', of: '申請一覧', name: '新しい順' },
    ])
  })

  test('結果は鍵で上書きし、時刻を付ける。発見と探索も鍵で上書きする', () => {
    const before: QualityDoc = { ...empty, checks: [{ ...approve, outcome: '不合格', saw: '載らない', at: 'T0' }] }
    const finding = { title: '承認が消える', kind: 'バグ' as const, detail: 'd', to: 'implementation' as const, state: '未解決' as const }
    const after = revised(before, { checks: [pass(approve), pass(apply)], findings: [finding] }) as QualityDoc
    expect(after.checks).toEqual([{ ...pass(approve), at: 'T1' }, { ...pass(apply), at: 'T1' }])
    expect((revised(after, { findings: [{ ...finding, state: '片づいた' }] }) as QualityDoc).findings).toEqual([{ ...finding, state: '片づいた' }])
  })

  test('ないケースには結果を付けない。呼び直せるよう、あるものを挙げる', () => {
    expect(revised(empty, { checks: [{ ...pass(apply), name: '却下される' }] })).toBe('behavior「経費を申請する」にケース「却下される」はない。あるのは: 申請される')
    expect(revised(empty, { checks: [{ ...pass(apply), of: '経費を消す' }] })).toBe('behavior に「経費を消す」はない。あるのは: 経費を申請する、再申請する、申請一覧')
  })

  test('「可」は全ケースが合格で、未解決の発見がないときだけ', () => {
    const verdict = { merge: '可' as const, why: '全部通った' }
    expect(revised(empty, { checks: all.slice(0, 3).map(pass), verdict })).toBe('合格していないケースがあるので「可」にできない: 「新しい順」(未実行)')
    const finding = { title: '曖昧', kind: '曖昧な仕様' as const, detail: 'd', to: 'behavior' as const, state: '未解決' as const }
    expect(revised(empty, { checks: all.map(pass), findings: [finding], verdict })).toBe('未解決の発見があるので「可」にできない: 「曖昧」')
    expect((revised(empty, { checks: all.map(pass), verdict }) as QualityDoc).verdict).toEqual({ ...verdict, at: 'T1' })
    expect((revised(empty, { verdict: { merge: '条件つき', why: '一覧は未確認' } }) as QualityDoc).verdict?.merge).toBe('条件つき')
  })
})
