import { describe, expect, test } from 'claude-code/testing'

import { Ship } from '../../../logic/ship/ship'
import { Status } from '../../../logic/status/status'

describe('ship', () => {
  test('同梱 skill の呼び出しから ship を知る', () => {
    expect(Ship.of('software-fleet:code-design').either(v => v, e => e)).toBe('code-design')
    expect(Ship.of('software-fleet:set-afloat').either(v => v, () => 'none')).toBe('none')
    expect(Ship.of('code-design').either(v => v, () => 'none')).toBe('none')
  })

  test('状態は報告した時刻から始まる', () => {
    expect(Status.since({ state: 'stuck', reason: 'x' }, '2026-10-18T10:00:00.000Z')).toEqual({ state: 'stuck', reason: 'x', since: '2026-10-18T10:00:00.000Z' })
  })
})
