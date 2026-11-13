import { describe, expect, test } from 'claude-code/testing'

import type { Engine, FleetSession } from '../../types/fleet'
import { allowOwnDb } from './allow-own-db'

const fleet = 'https://claude.ai/artifact/abc'
const engine = (session: FleetSession | undefined): Engine => ({
  now: async () => 0, fleet: async () => session, board: async () => {}, alone: async () => undefined, goAlone: async () => {}, offer: async () => {}, db: async () => ({ text: '' }),
})
const onBoard = engine({ url: fleet, role: 'flagship' })
const allowed = { decision: 'allow', reason: 'fleet の専用 tool による fleet の DB の読み書き' }

describe('allow-own-db', () => {
  test('mod 自身が fleet の DB を読み書きするときだけ許可する', async () => {
    expect(await allowOwnDb(onBoard, { action: 'set', url: fleet }, 'software-fleet', 'software-fleet')).toEqual(allowed)
    expect(await allowOwnDb(onBoard, { action: 'batch', url: `${fleet}/` }, 'software-fleet', 'software-fleet')).toEqual(allowed)
    expect(await allowOwnDb(onBoard, { action: 'get', url: fleet }, 'software-fleet', 'software-fleet')).toEqual(allowed)
  })

  test('LLM やほかの plugin の読み書きは engine の判定に任せる', async () => {
    expect(await allowOwnDb(onBoard, { action: 'set', url: fleet }, 'engine', 'software-fleet')).toBe(undefined)
    expect(await allowOwnDb(onBoard, { action: 'get', url: fleet }, 'engine', 'software-fleet')).toBe(undefined)
    expect(await allowOwnDb(onBoard, { action: 'set', url: fleet }, 'other-plugin', 'software-fleet')).toBe(undefined)
  })

  test('ほかの artifact・宛先の id が取れない・fleet に乗っていないときは engine の判定に任せる', async () => {
    expect(await allowOwnDb(onBoard, { action: 'get', url: 'https://claude.ai/artifact/other' }, 'software-fleet', 'software-fleet')).toBe(undefined)
    expect(await allowOwnDb(onBoard, { action: 'set' }, 'software-fleet', 'software-fleet')).toBe(undefined)
    expect(await allowOwnDb(onBoard, undefined, 'software-fleet', 'software-fleet')).toBe(undefined)
    expect(await allowOwnDb(engine(undefined), { action: 'set', url: fleet }, 'software-fleet', 'software-fleet')).toBe(undefined)
  })
})
