import { describe, expect, test } from 'claude-code/testing'

import type { Ship } from '../../../types/fleet'
import { Turn } from '../../../logic/turn/turn'

const converged: Ship = { state: 'converged', since: '2026-10-18T10:00:00.000Z' }

describe('turn', () => {
  test('ユーザが決めない限り、code-design と qa だけがレビュー必須', () => {
    expect(Turn.required('code-design', undefined)).toBe(true)
    expect(Turn.required('qa', {})).toBe(true)
    expect(Turn.required('ops', undefined)).toBe(false)
    expect(Turn.required('qa', { required: false })).toBe(false)
    expect(Turn.required('ops', { required: true })).toBe(true)
  })

  test('レビュー待ち = 収束 ∧ 必須 ∧ 今の収束をまだ承認していない', () => {
    expect(Turn.awaiting('qa', converged, undefined)).toBe(true)
    expect(Turn.awaiting('qa', { state: 'working', doing: 'x', since: converged.since }, undefined)).toBe(false)
    expect(Turn.awaiting('ops', converged, undefined)).toBe(false)
    expect(Turn.awaiting('qa', converged, { approved_since: converged.since })).toBe(false)
    expect(Turn.awaiting('qa', converged, { approved_since: '2026-10-18T09:00:00.000Z' })).toBe(true)
  })

})
