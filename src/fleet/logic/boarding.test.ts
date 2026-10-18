import { describe, expect, test } from 'claude-code/testing'

import type { FleetSession } from '../../types/fleet'
import { Boarding } from './boarding'

const qa: FleetSession = { url: 'https://claude.ai/artifact/abc', role: 'qa' }
const join = (aboard: FleetSession | undefined, wanted: FleetSession) => Boarding.join(aboard, wanted).either<unknown>(v => v, e => e)

describe('boarding', () => {
  test('乗れるのは flagship と 8 隻の ship', () => {
    expect(join(undefined, qa)).toEqual(qa)
    expect(join(undefined, { ...qa, role: 'flagship' })).toEqual({ ...qa, role: 'flagship' })
    expect(join(undefined, { ...qa, role: 'set-afloat' as never })).toBe('fleet の役割ではない: set-afloat')
    expect(Boarding.ships()).toHaveLength(8)
  })

  test('乗るのは一度だけ。別の fleet にも別の役割にも乗り換えない', () => {
    expect(join(qa, { url: 'https://claude.ai/artifact/other', role: 'ops' })).toBe('すでに qa として乗っている')
    expect(join(qa, qa)).toBe('すでに qa として乗っている')
  })
})
