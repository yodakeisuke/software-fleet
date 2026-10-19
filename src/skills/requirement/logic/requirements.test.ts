import { describe, expect, test } from 'claude-code/testing'

import type { Requirement, RequirementChange } from '../../../types/fleet'
import { Requirements } from './requirements'

const req = (who: string, can: string, kind: Requirement['kind'] = '機能'): Requirement =>
  ({ kind, change: '新', who, can, tests: [{ act: `${can}を試す`, evidence: `${can}が確かめられる` }] })
const approve = req('経理担当は', '予算を承認できる')
const hide = req('他部署の人は', '予算を見られない', 'セキュリティ')
const revised = (current: Requirement[], changes: RequirementChange[]) => Requirements.revise(current, changes).either<unknown>(list => list, error => error)

describe('requirements', () => {
  test('足すは末尾に、直すはその場で、消すは取り除く。要求は今の who と can で指す', () => {
    const fixed = { ...approve, can: '予算を差し戻せる' }
    expect(revised([], [{ op: 'add', to: approve }])).toEqual([approve])
    expect(revised([approve], [{ op: 'replace', which: { who: '経理担当は', can: '予算を承認できる' }, to: fixed }])).toEqual([fixed])
    expect(revised([approve, hide], [{ op: 'remove', which: { who: '経理担当は', can: '予算を承認できる' } }])).toEqual([hide])
  })

  test('区分の順に並べる。区分の中は足した順のまま', () => {
    const slow = req('経理担当は', '1 万件でも 3 秒で見られる', '性能')
    const reject = req('経理担当は', '予算を差し戻せる')
    expect(revised([], [slow, hide, approve, reject].map(to => ({ op: 'add', to })))).toEqual([approve, reject, hide, slow])
  })

  test('見つからなければ、今ある要求を全部挙げて、何も変えない', () => {
    expect(revised([approve], [{ op: 'remove', which: { who: '部長は', can: '予算を見られる' } }]))
      .toBe('見つからない: 「部長は、予算を見られる」。今ある要求: 「経理担当は、予算を承認できる」')
    expect(revised([], [{ op: 'remove', which: { who: '部長は', can: '予算を見られる' } }])).toBe('見つからない: 「部長は、予算を見られる」。今ある要求: なし')
  })

  test('同じ who と can の要求は 1 つだけで、要求にはテストが 1 件以上ある', () => {
    expect(revised([approve], [{ op: 'add', to: approve }])).toBe('「経理担当は、予算を承認できる」 が重なっている')
    expect(revised([], [{ op: 'add', to: { ...approve, tests: [] } }])).toBe('「経理担当は、予算を承認できる」 にテストがない')
  })
})
