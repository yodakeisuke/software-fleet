import { describe, expect, test } from 'claude-code/testing'

import type { Engine } from '../../types/fleet'
import { JsonSchema } from '../schema/json-schema'
import { reportStatus } from './report-status'

const status = (value: unknown) => JsonSchema.check(reportStatus.spec.inputSchema, { status: value }).either<unknown>(() => '', e => e)

describe('report-status', () => {
  test('report_status は state ごとに要る項目がある', () => {
    expect(status({ state: 'working', doing: 'API を設計中' })).toBe('')
    expect(status({ state: 'converged' })).toBe('')
    expect(status({ state: 'stuck' })).toBe('入力.status.reason がない')
    expect(status({ state: 'waiting', on: 'flagship', what: '判断' })).toBe('')
    expect(status({ state: 'waiting', on: 'user', what: '判断' })).toContain('入力.status.on は')
    expect(status({ state: 'waiting', on: 'nobody', what: '判断' })).toContain('入力.status.on は')
    expect(status({ state: 'done' })).toBe('入力.status は state: working | state: converged | state: stuck | state: waiting のどれかの形')
  })


  test('ship として乗っていないセッションは報告できない', async () => {
    const engine = { fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role: 'flagship' }) } as Engine
    expect(await reportStatus.run(engine, { status: { state: 'converged' } })).toEqual({ deny: 'このセッションは fleet の ship として乗っていない' })
  })
})
