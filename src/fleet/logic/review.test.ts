import { describe, expect, test } from 'claude-code/testing'

import type { Ship } from '../../types/fleet'
import { Review } from './review'

const converged: Ship = { state: 'converged', since: '2026-10-18T10:00:00.000Z' }

describe('review', () => {
  test('状態は報告した時刻から始まる', () => {
    expect(Review.since({ state: 'stuck', reason: 'x' }, '2026-10-18T10:00:00.000Z')).toEqual({ state: 'stuck', reason: 'x', since: '2026-10-18T10:00:00.000Z' })
  })

  test('ユーザが決めない限り、architect と qa だけがレビュー必須', () => {
    expect(Review.required('architect', undefined)).toBe(true)
    expect(Review.required('qa', {})).toBe(true)
    expect(Review.required('ops', undefined)).toBe(false)
    expect(Review.required('qa', { required: false })).toBe(false)
    expect(Review.required('ops', { required: true })).toBe(true)
  })

  test('レビュー待ち = 収束 ∧ 必須 ∧ 今の収束をまだ承認していない', () => {
    expect(Review.awaiting('qa', converged, undefined)).toBe(true)
    expect(Review.awaiting('qa', { state: 'working', doing: 'x', since: converged.since }, undefined)).toBe(false)
    expect(Review.awaiting('ops', converged, undefined)).toBe(false)
    expect(Review.awaiting('qa', converged, { approved_since: converged.since })).toBe(false)
    expect(Review.awaiting('qa', converged, { approved_since: '2026-10-18T09:00:00.000Z' })).toBe(true)
  })

})
